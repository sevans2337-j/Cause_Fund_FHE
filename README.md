# Confidential Crowdfunding Platform for Sensitive Causes

This project offers a **Confidential Crowdfunding Platform** tailored for sensitive social causes, utilizing **Zama's Fully Homomorphic Encryption technology** to ensure that donor identities and contribution amounts remain private. By leveraging advanced encryption techniques, this platform aims to foster a resilient civic society by enabling individuals to support sensitive initiatives without fear of social or political repercussions.

## Addressing the Challenge

In an increasingly interconnected world, many social causes, such as legal aid and independent documentaries, remain underfunded due to the risks associated with disclosing donor identities. Supporters often hesitate to contribute to initiatives that could attract negative attention or backlash. This project addresses these crucial challenges by ensuring complete anonymity for donors while providing a trustworthy platform for fundraising.

## The FHE Solution

**Fully Homomorphic Encryption (FHE)** is a groundbreaking technology that allows computations to be performed on encrypted data without needing to decrypt it first. This project employs **Zama's open-source libraries**—specifically the **Concrete SDK**—to provide a robust and secure environment for confidential transactions. This means that both the identities of donors and the amounts they contribute are encrypted using FHE, effectively safeguarding participants from external pressures and enabling more individuals to engage with civic issues.

## Core Functionalities

✨ **Key Features:**

- **Encrypted Donor Identity:** All contributions are anonymous, ensuring that no personal information is revealed during the donation process.
- **Support for Sensitive Causes:** Specifically designed to cater to initiatives that may face scrutiny or hostility.
- **Incentives for Participation:** Encourages broader engagement in social issues, fostering a resilient civic society.
- **Transparent Project Progress:** Allows users to track the crowdfunding progress without compromising the anonymity of contributors.

## Technology Stack

- **Zama's Concrete SDK:** The primary component for implementing Fully Homomorphic Encryption.
- **Solidity:** For writing the smart contracts.
- **Node.js:** JavaScript runtime for building the backend.
- **Hardhat/Foundry:** Development frameworks for Ethereum smart contracts.
- **Express.js:** For setting up the server.

## Directory Structure

The project is structured as follows:

```
Cause_Fund_FHE/
├── contracts/
│   └── CauseFund.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── test_CauseFund.js
├── package.json
└── README.md
```

## Installation Guide

To get started with the project, first ensure you have Node.js installed on your machine. Follow these steps to set up the development environment:

1. Install dependencies:
   ```bash
   npm install
   ```

   This command will also fetch the necessary Zama FHE libraries.

2. Ensure that Hardhat or Foundry is installed according to your preference for development.

**Important:** Please do not use `git clone` or any URLs to download this project. Instead, make sure to download the project files directly.

## Build & Run Guide

After setting up the project, you will need to compile the smart contracts and run the server. Here are the commands to do so:

1. Compile the contracts:
   ```bash
   npx hardhat compile
   ```

2. Deploy the contracts to your local Ethereum network (make sure your local network is running):
   ```bash
   npx hardhat run scripts/deploy.js
   ```

3. Run tests to ensure everything works as expected:
   ```bash
   npx hardhat test
   ```

4. Start the server:
   ```bash
   node index.js
   ```

## Example Usage

Here is a code snippet that demonstrates how to create a new crowdfunding project securely:

```javascript
const { ethers } = require("hardhat");

async function createProject(title, description, targetAmount) {
    const CauseFund = await ethers.getContractFactory("CauseFund");
    const causeFund = await CauseFund.deploy();
    
    await causeFund.createProject(title, description, targetAmount);
    
    console.log(`Project "${title}" created with target amount of ${targetAmount} wei.`);
}

createProject("Legal Aid Initiative", "Support for legal representation for marginalized groups", ethers.utils.parseEther("5"));
```

## Acknowledgements

### Powered by Zama

A heartfelt thank you to the Zama team for their pioneering work in the realm of Fully Homomorphic Encryption. Their commitment to open-source tools and innovation has paved the way for the development of secure and confidential blockchain applications, making projects like this possible. 

Together, we aim to create a safer space for funding social causes while protecting those who wish to support them.
