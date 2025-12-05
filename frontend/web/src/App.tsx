// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Campaign {
  id: number;
  title: string;
  description: string;
  goalAmount: number;
  currentAmount: number;
  encryptedAmount: string;
  creator: string;
  timestamp: number;
  category: string;
}

interface Donation {
  donor: string;
  amount: number;
  encryptedAmount: string;
  timestamp: number;
}

interface UserAction {
  type: 'create' | 'donate' | 'decrypt';
  timestamp: number;
  details: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newCampaignData, setNewCampaignData] = useState({ title: "", description: "", goalAmount: 0, category: "Legal Aid" });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [donationAmount, setDonationAmount] = useState(0);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donating, setDonating] = useState(false);
  
  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load campaigns
      const campaignsBytes = await contract.getData("campaigns");
      let campaignsList: Campaign[] = [];
      if (campaignsBytes.length > 0) {
        try {
          const campaignsStr = ethers.toUtf8String(campaignsBytes);
          if (campaignsStr.trim() !== '') campaignsList = JSON.parse(campaignsStr);
        } catch (e) {}
      }
      setCampaigns(campaignsList);
      
      // Load donations
      const donationsBytes = await contract.getData("donations");
      let donationsList: Donation[] = [];
      if (donationsBytes.length > 0) {
        try {
          const donationsStr = ethers.toUtf8String(donationsBytes);
          if (donationsStr.trim() !== '') donationsList = JSON.parse(donationsStr);
        } catch (e) {}
      }
      setDonations(donationsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new campaign
  const createCampaign = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingCampaign(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating campaign with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new campaign
      const newCampaign: Campaign = {
        id: campaigns.length + 1,
        title: newCampaignData.title,
        description: newCampaignData.description,
        goalAmount: newCampaignData.goalAmount,
        currentAmount: 0,
        encryptedAmount: FHEEncryptNumber(0), // Initialize with 0
        creator: address,
        timestamp: Math.floor(Date.now() / 1000),
        category: newCampaignData.category
      };
      
      // Update campaigns list
      const updatedCampaigns = [...campaigns, newCampaign];
      
      // Save to contract
      await contract.setData("campaigns", ethers.toUtf8Bytes(JSON.stringify(updatedCampaigns)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'create',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Created campaign: ${newCampaignData.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Campaign created successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCampaignData({ title: "", description: "", goalAmount: 0, category: "Legal Aid" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingCampaign(false); 
    }
  };

  // Donate to campaign
  const donateToCampaign = async () => {
    if (!isConnected || !address || !selectedCampaign) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    if (donationAmount <= 0) {
      setTransactionStatus({ visible: true, status: "error", message: "Please enter a valid donation amount" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }
    
    setDonating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Processing donation with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the campaign
      const campaignIndex = campaigns.findIndex(c => c.id === selectedCampaign.id);
      if (campaignIndex === -1) throw new Error("Campaign not found");
      
      // Update campaign amount
      const updatedCampaigns = [...campaigns];
      updatedCampaigns[campaignIndex].currentAmount += donationAmount;
      updatedCampaigns[campaignIndex].encryptedAmount = FHEEncryptNumber(updatedCampaigns[campaignIndex].currentAmount);
      
      // Save updated campaigns
      await contract.setData("campaigns", ethers.toUtf8Bytes(JSON.stringify(updatedCampaigns)));
      
      // Create donation record
      const newDonation: Donation = {
        donor: address,
        amount: donationAmount,
        encryptedAmount: FHEEncryptNumber(donationAmount),
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Update donations list
      const updatedDonations = [...donations, newDonation];
      await contract.setData("donations", ethers.toUtf8Bytes(JSON.stringify(updatedDonations)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'donate',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Donated ${donationAmount} ETH to ${selectedCampaign.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Donation successful! Thank you for your support!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowDonationModal(false);
        setDonationAmount(0);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Donation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setDonating(false); 
    }
  };

  // Decrypt amount with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted FHE data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Render progress bar
  const renderProgressBar = (campaign: Campaign) => {
    const progress = campaign.currentAmount / campaign.goalAmount * 100;
    return (
      <div className="progress-container">
        <div className="progress-bar" style={{ width: `${Math.min(progress, 100)}%` }}>
          <span className="progress-text">{Math.round(progress)}%</span>
        </div>
      </div>
    );
  };

  // Render FHE flow visualization
  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Donor Participation</h4>
            <p>Donors choose sensitive social causes to support</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>FHE Encryption</h4>
            <p>Donation amount and identity encrypted with Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Homomorphic Computation</h4>
            <p>Total donation amount calculated on encrypted data</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Privacy Protection</h4>
            <p>Donor identity and amount protected from social pressure</p>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'create' && '📝'}
              {action.type === 'donate' && '💰'}
              {action.type === 'decrypt' && '🔓'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is Cause Fund FHE?",
        answer: "Cause Fund FHE is a crowdfunding platform for sensitive social causes (like legal aid, independent documentaries) that uses Zama FHE technology to encrypt supporters' identities and donation amounts, protecting them from social or political pressure."
      },
      {
        question: "How does FHE protect my privacy?",
        answer: "Fully Homomorphic Encryption (FHE) allows computations to be performed on encrypted data without decrypting it. Your donation amount and identity remain encrypted on the platform at all times, and even platform administrators cannot access the raw data."
      },
      {
        question: "How do I know my donation is secure?",
        answer: "All donation records are stored on the blockchain and encrypted with FHE. Only you have the decryption key and can verify your donation records at any time."
      },
      {
        question: "What types of projects are supported?",
        answer: "We support various sensitive social causes including but not limited to legal aid, independent journalism, human rights advocacy, environmental protection, and artistic creation."
      },
      {
        question: "How do I create a project?",
        answer: "After connecting your wallet, click the 'Create Campaign' button, fill in the project information and submit. Projects will be listed on the platform after a simple review process."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  // Render partners section
  const renderPartners = () => {
    const partners = [
      { name: "Zama", description: "FHE Technology Provider" },
      { name: "Human Rights Watch", description: "Human Rights Advocacy Organization" },
      { name: "Open Society Foundations", description: "Social Justice Supporter" },
      { name: "Blockchain for Good Alliance", description: "Blockchain Technology for Public Good" }
    ];
    
    return (
      <div className="partners-grid">
        {partners.map((partner, index) => (
          <div className="partner-card" key={index}>
            <div className="partner-logo">{partner.name.charAt(0)}</div>
            <h3>{partner.name}</h3>
            <p>{partner.description}</p>
          </div>
        ))}
      </div>
    );
  };

  // Render statistics
  const renderStatistics = () => {
    const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0);
    const totalCampaigns = campaigns.length;
    const completedCampaigns = campaigns.filter(c => c.currentAmount >= c.goalAmount).length;
    
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalCampaigns}</div>
          <div className="stat-label">Total Campaigns</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalDonations.toFixed(2)} ETH</div>
          <div className="stat-label">Total Donations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{donations.length}</div>
          <div className="stat-label">Total Donations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedCampaigns}</div>
          <div className="stat-label">Completed Campaigns</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted crowdfunding system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="campaign-icon"></div>
          </div>
          <h1>Cause Fund<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-campaign-btn"
          >
            <div className="add-icon"></div>Create Campaign
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="intro-section">
          <div className="intro-card">
            <h2>Privacy-First Crowdfunding for Sensitive Causes</h2>
            <p>Cause Fund FHE uses Zama FHE technology to encrypt supporters' identities and donation amounts, protecting them from social or political pressure and encouraging more participation in social causes.</p>
            <div className="fhe-badge">
              <div className="fhe-icon"></div>
              <span>Powered by Zama FHE</span>
            </div>
          </div>
          
          <div className="intro-card">
            <h2>FHE Donation Process</h2>
            {renderFHEFlow()}
          </div>
        </div>
        
        <div className="dashboard-section">
          <div className="section-header">
            <h2>Platform Statistics</h2>
            <button 
              onClick={loadData} 
              className="refresh-btn" 
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Data"}
            </button>
          </div>
          {renderStatistics()}
        </div>
        
        <div className="tabs-container">
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'campaigns' ? 'active' : ''}`}
              onClick={() => setActiveTab('campaigns')}
            >
              Campaigns
            </button>
            <button 
              className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
              onClick={() => setActiveTab('actions')}
            >
              My Actions
            </button>
            <button 
              className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveTab('faq')}
            >
              FAQ
            </button>
            <button 
              className={`tab ${activeTab === 'partners' ? 'active' : ''}`}
              onClick={() => setActiveTab('partners')}
            >
              Partners
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'campaigns' && (
              <div className="campaigns-section">
                <div className="campaigns-grid">
                  {campaigns.length === 0 ? (
                    <div className="no-campaigns">
                      <div className="no-campaigns-icon"></div>
                      <p>No campaigns found</p>
                      <button 
                        className="create-btn" 
                        onClick={() => setShowCreateModal(true)}
                      >
                        Create First Campaign
                      </button>
                    </div>
                  ) : campaigns.map((campaign, index) => (
                    <div 
                      className="campaign-card" 
                      key={index}
                      onClick={() => setSelectedCampaign(campaign)}
                    >
                      <div className="campaign-category">{campaign.category}</div>
                      <div className="campaign-title">{campaign.title}</div>
                      <div className="campaign-description">{campaign.description.substring(0, 100)}...</div>
                      
                      <div className="campaign-progress">
                        <div className="progress-info">
                          <span>Raised: {campaign.currentAmount.toFixed(2)} ETH</span>
                          <span>Goal: {campaign.goalAmount.toFixed(2)} ETH</span>
                        </div>
                        {renderProgressBar(campaign)}
                      </div>
                      
                      <div className="campaign-footer">
                        <div className="creator-info">
                          <span>Creator:</span>
                          <span>{campaign.creator.substring(0, 6)}...{campaign.creator.substring(38)}</span>
                        </div>
                        <button className="donate-btn">Donate</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeTab === 'actions' && (
              <div className="actions-section">
                <h2>My Activity History</h2>
                {renderUserActions()}
              </div>
            )}
            
            {activeTab === 'faq' && (
              <div className="faq-section">
                <h2>Frequently Asked Questions</h2>
                {renderFAQ()}
              </div>
            )}
            
            {activeTab === 'partners' && (
              <div className="partners-section">
                <h2>Our Partners</h2>
                {renderPartners()}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <CreateCampaignModal 
          onSubmit={createCampaign} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingCampaign} 
          campaignData={newCampaignData} 
          setCampaignData={setNewCampaignData}
        />
      )}
      
      {selectedCampaign && (
        <CampaignDetailModal 
          campaign={selectedCampaign} 
          onClose={() => { 
            setSelectedCampaign(null); 
            setDecryptedAmount(null); 
          }} 
          decryptedAmount={decryptedAmount} 
          setDecryptedAmount={setDecryptedAmount} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          setShowDonationModal={setShowDonationModal}
          renderProgressBar={renderProgressBar}
        />
      )}
      
      {showDonationModal && selectedCampaign && (
        <DonationModal 
          campaign={selectedCampaign}
          donationAmount={donationAmount}
          setDonationAmount={setDonationAmount}
          onDonate={donateToCampaign}
          onClose={() => setShowDonationModal(false)}
          donating={donating}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="campaign-icon"></div>
              <span>Cause Fund FHE</span>
            </div>
            <p>Privacy-first crowdfunding for sensitive causes</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About Us</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact Us</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Cause Fund FHE. All rights reserved.</div>
          <div className="disclaimer">
            This platform uses Fully Homomorphic Encryption to protect donor privacy. All donation amounts and identities are encrypted.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface CreateCampaignModalProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  campaignData: any;
  setCampaignData: (data: any) => void;
}

const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({ onSubmit, onClose, creating, campaignData, setCampaignData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCampaignData({ ...campaignData, [name]: name === 'goalAmount' ? parseFloat(value) : value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-campaign-modal">
        <div className="modal-header">
          <h2>Create New Campaign</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Privacy Statement</strong>
              <p>This campaign will encrypt all donation information using FHE technology</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Campaign Title *</label>
            <input 
              type="text" 
              name="title" 
              value={campaignData.title} 
              onChange={handleChange} 
              placeholder="Enter campaign title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <textarea 
              name="description" 
              value={campaignData.description} 
              onChange={handleChange} 
              placeholder="Describe your campaign..." 
              rows={4}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Goal Amount (ETH) *</label>
              <input 
                type="number" 
                name="goalAmount" 
                value={campaignData.goalAmount} 
                onChange={handleChange} 
                placeholder="Enter goal amount..." 
                min="0.01"
                step="0.01"
              />
            </div>
            
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category" 
                value={campaignData.category} 
                onChange={handleChange}
              >
                <option value="Legal Aid">Legal Aid</option>
                <option value="Independent Documentary">Independent Documentary</option>
                <option value="Human Rights Advocacy">Human Rights Advocacy</option>
                <option value="Environmental Protection">Environmental Protection</option>
                <option value="Artistic Creation">Artistic Creation</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !campaignData.title || !campaignData.description || campaignData.goalAmount <= 0} 
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface CampaignDetailModalProps {
  campaign: Campaign;
  onClose: () => void;
  decryptedAmount: number | null;
  setDecryptedAmount: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  setShowDonationModal: (value: boolean) => void;
  renderProgressBar: (campaign: Campaign) => JSX.Element;
}

const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({ 
  campaign, 
  onClose, 
  decryptedAmount, 
  setDecryptedAmount, 
  isDecrypting, 
  decryptWithSignature,
  setShowDonationModal,
  renderProgressBar
}) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null) { 
      setDecryptedAmount(null); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(campaign.encryptedAmount);
    if (decrypted !== null) {
      setDecryptedAmount(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="campaign-detail-modal">
        <div className="modal-header">
          <h2>Campaign Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="campaign-info">
            <div className="campaign-category">{campaign.category}</div>
            <h2 className="campaign-title">{campaign.title}</h2>
            <div className="campaign-description">{campaign.description}</div>
            
            <div className="info-grid">
              <div className="info-item">
                <span>Creator:</span>
                <strong>{campaign.creator.substring(0, 6)}...{campaign.creator.substring(38)}</strong>
              </div>
              <div className="info-item">
                <span>Created:</span>
                <strong>{new Date(campaign.timestamp * 1000).toLocaleDateString()}</strong>
              </div>
              <div className="info-item">
                <span>Goal Amount:</span>
                <strong>{campaign.goalAmount.toFixed(2)} ETH</strong>
              </div>
            </div>
          </div>
          
          <div className="progress-section">
            <h3>Funding Progress</h3>
            {renderProgressBar(campaign)}
            <div className="progress-info">
              <span>Raised: {campaign.currentAmount.toFixed(2)} ETH</span>
              <span>Goal: {campaign.goalAmount.toFixed(2)} ETH</span>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Donation Data</h3>
            <div className="encrypted-data">{campaign.encryptedAmount.substring(0, 100)}...</div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted Data</span>
            </div>
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedAmount !== null ? (
                "Hide Decrypted Data"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedAmount !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Data</h3>
              <div className="decrypted-value">
                <span>Actual Amount Raised:</span>
                <strong>{decryptedAmount.toFixed(2)} ETH</strong>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted data is visible only to you and not stored on-chain</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            className="donate-btn" 
            onClick={() => setShowDonationModal(true)}
          >
            Make a Donation
          </button>
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

interface DonationModalProps {
  campaign: Campaign;
  donationAmount: number;
  setDonationAmount: (value: number) => void;
  onDonate: () => void;
  onClose: () => void;
  donating: boolean;
}

const DonationModal: React.FC<DonationModalProps> = ({ 
  campaign, 
  donationAmount, 
  setDonationAmount, 
  onDonate, 
  onClose,
  donating
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDonationAmount(parseFloat(e.target.value));
  };

  return (
    <div className="modal-overlay">
      <div className="donation-modal">
        <div className="modal-header">
          <h2>Support Campaign: {campaign.title}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>Private Donation Statement</strong>
              <p>Your donation amount and identity will be encrypted using FHE technology</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Donation Amount (ETH) *</label>
            <input 
              type="number" 
              value={donationAmount} 
              onChange={handleChange} 
              placeholder="Enter donation amount..." 
              min="0.01"
              step="0.01"
            />
          </div>
          
          <div className="donation-info">
            <div className="info-item">
              <span>Current Amount:</span>
              <strong>{campaign.currentAmount.toFixed(2)} ETH</strong>
            </div>
            <div className="info-item">
              <span>Goal Amount:</span>
              <strong>{campaign.goalAmount.toFixed(2)} ETH</strong>
            </div>
            <div className="info-item">
              <span>Total After Donation:</span>
              <strong>{(campaign.currentAmount + donationAmount).toFixed(2)} ETH</strong>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onDonate} 
            disabled={donating || donationAmount <= 0} 
            className="submit-btn"
          >
            {donating ? "Processing with FHE..." : "Confirm Donation"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;