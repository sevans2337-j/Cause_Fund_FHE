pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CauseFundFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error InvalidArgument();
    error ReplayAttempt();
    error StateMismatch();
    error DecryptionFailed();

    enum BatchStatus { Open, Closed }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct Batch {
        uint256 id;
        uint256 totalEncryptedDonations; // euint32
        uint256 donorCount; // euint32
        BatchStatus status;
    }

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => mapping(address => bool)) public hasDonatedInBatch;

    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event DonationSubmitted(address indexed donor, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalDonations, uint256 donorCount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        emit ProviderAdded(owner);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            paused = true;
            emit Paused(msg.sender);
        } else {
            paused = false;
            emit Unpaused(msg.sender);
        }
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        if (newCooldown == 0) revert InvalidArgument();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSet(oldCooldown, newCooldown);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        Batch storage newBatch = batches[currentBatchId];
        newBatch.id = currentBatchId;
        newBatch.totalEncryptedDonations = FHE.asEuint32(0).toStorage();
        newBatch.donorCount = FHE.asEuint32(0).toStorage();
        newBatch.status = BatchStatus.Open;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.status != BatchStatus.Open) revert InvalidBatch();
        batch.status = BatchStatus.Closed;
        emit BatchClosed(batchId);
    }

    function submitDonation(
        uint256 batchId,
        euint32 encryptedAmount
    ) external whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.status != BatchStatus.Open) revert InvalidBatch();

        if (!hasDonatedInBatch[batchId][msg.sender]) {
            euint32 memory currentCount = FHE.asEuint32(batch.donorCount);
            batch.donorCount = FHE.add(currentCount, FHE.asEuint32(1)).toStorage();
            hasDonatedInBatch[batchId][msg.sender] = true;
        }

        euint32 memory currentTotal = FHE.asEuint32(batch.totalEncryptedDonations);
        batch.totalEncryptedDonations = FHE.add(currentTotal, encryptedAmount).toStorage();

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit DonationSubmitted(msg.sender, batchId);
    }

    function requestBatchDecryption(uint256 batchId) external onlyProvider whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.status != BatchStatus.Closed) revert InvalidBatch();

        euint32 memory totalEncryptedDonations = FHE.asEuint32(batch.totalEncryptedDonations);
        euint32 memory encryptedDonorCount = FHE.asEuint32(batch.donorCount);

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(totalEncryptedDonations);
        cts[1] = FHE.toBytes32(encryptedDonorCount);

        bytes32 stateHash = keccak256(abi.encode(cts, address(this)));
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();
        // Security: Replay protection ensures this callback is processed only once for a given requestId.

        uint256 batchId = decryptionContexts[requestId].batchId;
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];

        euint32 memory currentTotalEncrypted = FHE.asEuint32(batch.totalEncryptedDonations);
        euint32 memory currentEncryptedCount = FHE.asEuint32(batch.donorCount);

        bytes32[] memory currentCts = new bytes32[](2);
        currentCts[0] = FHE.toBytes32(currentTotalEncrypted);
        currentCts[1] = FHE.toBytes32(currentEncryptedCount);

        bytes32 currentStateHash = keccak256(abi.encode(currentCts, address(this)));
        // Security: State hash verification ensures that the contract's relevant state
        // (specifically, the ciphertexts intended for decryption) has not changed
        // since the decryption was requested. This prevents scenarios where an attacker
        // might alter the data after a request but before the callback is processed.
        if (currentStateHash != decryptionContexts[requestId].stateHash) revert StateMismatch();

        try FHE.checkSignatures(requestId, cleartexts, proof) {
            // Decode cleartexts in the same order they were requested
            uint32 totalDonations = abi.decode(cleartexts, (uint32));
            uint32 donorCount = abi.decode(cleartexts[32:], (uint32));

            decryptionContexts[requestId].processed = true;
            emit DecryptionCompleted(requestId, batchId, totalDonations, donorCount);
        } catch {
            revert DecryptionFailed();
        }
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 storage s) internal {
        if (!FHE.isInitialized(s)) {
            s = FHE.asEuint32(0).toStorage();
        }
    }

    function _requireInitialized(euint32 storage s) internal view {
        if (!FHE.isInitialized(s)) revert InvalidArgument();
    }
}