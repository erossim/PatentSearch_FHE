pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PatentSearch_FHE is ZamaEthereumConfig {
    struct EncryptedPatent {
        euint32 encryptedKeywords;
        uint256 patentId;
        address owner;
        uint256 timestamp;
        bool isVerified;
    }

    mapping(uint256 => EncryptedPatent) public encryptedPatents;
    mapping(address => uint256[]) public ownerPatents;
    mapping(string => uint256[]) public keywordIndex;

    event PatentRegistered(uint256 indexed patentId, address indexed owner);
    event SearchPerformed(string indexed keyword, uint256[] results);
    event VerificationComplete(uint256 indexed patentId, bool isValid);

    modifier onlyOwner(uint256 patentId) {
        require(encryptedPatents[patentId].owner == msg.sender, "Not patent owner");
        _;
    }

    constructor() ZamaEthereumConfig() {
    }

    function registerPatent(
        uint256 patentId,
        externalEuint32 encryptedKeywords,
        bytes calldata registrationProof
    ) external {
        require(encryptedPatents[patentId].owner == address(0), "Patent already registered");

        euint32 encryptedData = FHE.fromExternal(encryptedKeywords, registrationProof);
        require(FHE.isInitialized(encryptedData), "Invalid encrypted data");

        encryptedPatents[patentId] = EncryptedPatent({
            encryptedKeywords: encryptedData,
            patentId: patentId,
            owner: msg.sender,
            timestamp: block.timestamp,
            isVerified: false
        });

        ownerPatents[msg.sender].push(patentId);
        emit PatentRegistered(patentId, msg.sender);
    }

    function addKeywordIndex(
        uint256 patentId,
        string calldata keyword,
        bytes calldata indexProof
    ) external onlyOwner(patentId) {
        require(encryptedPatents[patentId].patentId != 0, "Patent does not exist");
        require(bytes(keyword).length > 0, "Invalid keyword");

        keywordIndex[keyword].push(patentId);
        emit SearchPerformed(keyword, keywordIndex[keyword]);
    }

    function searchPatents(
        string calldata keyword,
        bytes calldata searchProof
    ) external view returns (uint256[] memory) {
        require(keywordIndex[keyword].length > 0, "No patents match keyword");
        return keywordIndex[keyword];
    }

    function verifyPatent(
        uint256 patentId,
        bytes calldata verificationProof
    ) external onlyOwner(patentId) {
        require(!encryptedPatents[patentId].isVerified, "Patent already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedPatents[patentId].encryptedKeywords);

        bool isValid = FHE.checkSignatures(cts, "", verificationProof);
        encryptedPatents[patentId].isVerified = isValid;

        emit VerificationComplete(patentId, isValid);
    }

    function getPatentDetails(uint256 patentId) external view returns (
        uint256, 
        address, 
        uint256, 
        bool
    ) {
        require(encryptedPatents[patentId].patentId != 0, "Patent does not exist");
        EncryptedPatent storage patent = encryptedPatents[patentId];

        return (
            patent.patentId,
            patent.owner,
            patent.timestamp,
            patent.isVerified
        );
    }

    function getOwnerPatents(address owner) external view returns (uint256[] memory) {
        require(ownerPatents[owner].length > 0, "Owner has no patents");
        return ownerPatents[owner];
    }

    function getKeywordPatents(string calldata keyword) external view returns (uint256[] memory) {
        require(keywordIndex[keyword].length > 0, "No patents for keyword");
        return keywordIndex[keyword];
    }

    function isPatentVerified(uint256 patentId) external view returns (bool) {
        return encryptedPatents[patentId].isVerified;
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
    }

    fallback() external payable {
    }
}

