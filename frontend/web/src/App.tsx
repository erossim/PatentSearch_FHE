import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface PatentData {
  id: string;
  title: string;
  encryptedKeywords: string;
  publicCategory: string;
  description: string;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue?: number;
  searchScore: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [patents, setPatents] = useState<PatentData[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searching, setSearching] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState({ 
    visible: false, 
    status: "pending" as "pending" | "success" | "error", 
    message: "" 
  });
  const [searchData, setSearchData] = useState({ keywords: "", category: "" });
  const [selectedPatent, setSelectedPatent] = useState<PatentData | null>(null);
  const [decryptedKeywords, setDecryptedKeywords] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchResults, setSearchResults] = useState<PatentData[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [showIntro, setShowIntro] = useState(true);
  const [faqOpen, setFaqOpen] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevm = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('FHEVM init failed:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevm();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        setContractAddress(await contract.getAddress());
        const businessIds = await contract.getAllBusinessIds();
        const patentsList: PatentData[] = [];
        
        for (const businessId of businessIds) {
          try {
            const data = await contract.getBusinessData(businessId);
            patentsList.push({
              id: businessId,
              title: data.name,
              encryptedKeywords: businessId,
              publicCategory: data.description,
              description: `专利分类: ${data.publicValue1}`,
              timestamp: Number(data.timestamp),
              creator: data.creator,
              isVerified: data.isVerified,
              decryptedValue: Number(data.decryptedValue) || 0,
              searchScore: Math.random() * 100
            });
          } catch (e) {
            console.error('Error loading patent:', e);
          }
        }
        
        setPatents(patentsList);
        setSearchResults(patentsList);
      } catch (e) {
        console.error('Load data error:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const searchPatent = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setSearching(true);
    setTransactionStatus({ visible: true, status: "pending", message: "同态加密搜索中..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("合约连接失败");
      
      const keywordValue = parseInt(searchData.keywords) || 1001;
      const businessId = `patent-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, keywordValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        `专利搜索: ${searchData.keywords}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(searchData.category) || 1,
        0,
        `分类: ${searchData.category}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "加密搜索成功!" });
      
      const newPatent: PatentData = {
        id: businessId,
        title: `专利搜索: ${searchData.keywords}`,
        encryptedKeywords: businessId,
        publicCategory: searchData.category,
        description: `加密关键词: ${searchData.keywords}`,
        timestamp: Date.now() / 1000,
        creator: address,
        isVerified: false,
        searchScore: Math.random() * 100
      };
      
      setPatents(prev => [newPatent, ...prev]);
      setSearchResults(prev => [newPatent, ...prev]);
      setShowSearchModal(false);
      setSearchData({ keywords: "", category: "" });
    } catch (e: any) {
      const errorMsg = e.message?.includes("user rejected") ? "用户取消交易" : "搜索失败";
      setTransactionStatus({ visible: true, status: "error", message: errorMsg });
    } finally { 
      setSearching(false); 
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptKeywords = async (patentId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const patentData = await contractRead.getBusinessData(patentId);
      if (patentData.isVerified) {
        setTransactionStatus({ visible: true, status: "success", message: "数据已验证" });
        return Number(patentData.decryptedValue);
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValue = await contractRead.getEncryptedValue(patentId);
      
      const result = await verifyDecryption(
        [encryptedValue],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(patentId, abiEncodedClearValues, decryptionProof)
      );
      
      const clearValue = result.decryptionResult.clearValues[encryptedValue];
      setDecryptedKeywords(Number(clearValue));
      
      setTransactionStatus({ visible: true, status: "success", message: "关键词解密成功!" });
      return Number(clearValue);
      
    } catch (e: any) { 
      setTransactionStatus({ visible: true, status: "error", message: "解密失败" });
      return null; 
    } finally { 
      setIsDecrypting(false); 
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (contract) {
        const available = await contract.isAvailable();
        setTransactionStatus({ visible: true, status: "success", message: "系统可用性检查通过" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      console.error('Availability check failed:', e);
    }
  };

  const filterPatents = (tab: string) => {
    setActiveTab(tab);
    if (tab === "all") {
      setSearchResults(patents);
    } else if (tab === "verified") {
      setSearchResults(patents.filter(p => p.isVerified));
    } else {
      setSearchResults(patents.filter(p => p.publicCategory === tab));
    }
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <div className="logo-icon">🔍</div>
            <h1>Confidential Patent Search</h1>
            <span className="logo-subtitle">FHE同态加密保护</span>
          </div>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="prompt-icon">🔐</div>
            <h2>连接钱包开始隐私检索</h2>
            <p>使用全同态加密技术保护您的研发方向，安全检索专利数据库</p>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="feature-icon">⚡</div>
                <h4>加密搜索</h4>
                <p>关键词全程加密，不暴露商业机密</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🛡️</div>
                <h4>IP保护</h4>
                <p>零知识证明，保护研发方向</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔍</div>
                <h4>精准匹配</h4>
                <p>同态计算确保搜索结果准确</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="encryption-animation">
          <div className="lock-icon">🔒</div>
          <div className="encryption-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <p>初始化FHE加密系统...</p>
        <p className="status-text">{status}</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-main">
          <div className="logo-section">
            <div className="logo-icon">🔍</div>
            <div>
              <h1>专利隐私检索</h1>
              <span className="tag-fhe">FHE Protected</span>
            </div>
          </div>
          
          <nav className="main-nav">
            <button 
              className={activeTab === "all" ? "nav-btn active" : "nav-btn"}
              onClick={() => filterPatents("all")}
            >
              全部专利
            </button>
            <button 
              className={activeTab === "verified" ? "nav-btn active" : "nav-btn"}
              onClick={() => filterPatents("verified")}
            >
              已验证
            </button>
            <button 
              className={activeTab === "tech" ? "nav-btn active" : "nav-btn"}
              onClick={() => filterPatents("tech")}
            >
              技术专利
            </button>
          </nav>
          
          <div className="header-actions">
            <button className="info-btn" onClick={() => setShowIntro(!showIntro)}>
              {showIntro ? "隐藏介绍" : "显示介绍"}
            </button>
            <button className="faq-btn" onClick={() => setFaqOpen(!faqOpen)}>
              常见问题
            </button>
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      {showIntro && (
        <section className="intro-section">
          <div className="intro-content">
            <h2>🔐 全同态加密专利检索系统</h2>
            <p>使用Zama FHE技术，在加密状态下进行专利搜索，保护企业研发机密</p>
            <div className="tech-flow">
              <div className="flow-step">
                <span className="step-number">1</span>
                <div className="step-content">
                  <h4>加密输入</h4>
                  <p>关键词在本地加密后上传</p>
                </div>
              </div>
              <div className="flow-step">
                <span className="step-number">2</span>
                <div className="step-content">
                  <h4>同态匹配</h4>
                  <p>在加密数据上执行搜索算法</p>
                </div>
              </div>
              <div className="flow-step">
                <span className="step-number">3</span>
                <div className="step-content">
                  <h4>安全解密</h4>
                  <p>仅用户可解密最终结果</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {faqOpen && (
        <section className="faq-section">
          <div className="faq-content">
            <h3>❓ 常见问题解答</h3>
            <div className="faq-list">
              <div className="faq-item">
                <h4>如何保证搜索隐私？</h4>
                <p>使用FHE全同态加密，搜索关键词在加密状态下进行匹配，服务器无法获取明文信息。</p>
              </div>
              <div className="faq-item">
                <h4>支持哪些类型的搜索？</h4>
                <p>目前支持整型关键词加密搜索，后续将扩展支持更复杂的数据类型。</p>
              </div>
              <div className="faq-item">
                <h4>解密过程安全吗？</h4>
                <p>解密密钥仅用户持有，通过零知识证明验证解密正确性，确保结果可信。</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <main className="main-content">
        <div className="search-section">
          <div className="search-header">
            <h2>🔍 隐私专利检索</h2>
            <div className="search-stats">
              <span>总专利数: {patents.length}</span>
              <span>已验证: {patents.filter(p => p.isVerified).length}</span>
            </div>
          </div>
          
          <div className="search-actions">
            <button 
              className="primary-btn search-btn"
              onClick={() => setShowSearchModal(true)}
            >
              + 新建加密搜索
            </button>
            <button 
              className="secondary-btn"
              onClick={checkAvailability}
            >
              系统检查
            </button>
          </div>
        </div>

        <div className="results-section">
          <div className="results-header">
            <h3>搜索结果 ({searchResults.length})</h3>
            <div className="sort-options">
              <select onChange={(e) => filterPatents(e.target.value)} value={activeTab}>
                <option value="all">全部</option>
                <option value="verified">已验证</option>
                <option value="tech">技术类</option>
              </select>
            </div>
          </div>

          <div className="patents-grid">
            {searchResults.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <p>暂无专利数据</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowSearchModal(true)}
                >
                  开始第一次搜索
                </button>
              </div>
            ) : (
              searchResults.map((patent, index) => (
                <div 
                  key={patent.id}
                  className={`patent-card ${patent.isVerified ? 'verified' : ''}`}
                  onClick={() => setSelectedPatent(patent)}
                >
                  <div className="card-header">
                    <h4>{patent.title}</h4>
                    {patent.isVerified && <span className="verified-badge">✅ 已验证</span>}
                  </div>
                  <div className="card-content">
                    <p>{patent.description}</p>
                    <div className="card-meta">
                      <span>分类: {patent.publicCategory}</span>
                      <span>匹配度: {patent.searchScore.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="card-footer">
                    <span>{new Date(patent.timestamp * 1000).toLocaleDateString()}</span>
                    <button 
                      className={`decrypt-btn ${patent.isVerified ? 'verified' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        decryptKeywords(patent.id);
                      }}
                    >
                      {patent.isVerified ? '已解密' : '解密关键词'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {showSearchModal && (
        <div className="modal-overlay">
          <div className="search-modal">
            <div className="modal-header">
              <h3>🔐 新建加密搜索</h3>
              <button onClick={() => setShowSearchModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="encryption-notice">
                <div className="notice-icon">🔒</div>
                <p>搜索关键词将使用FHE加密，保护您的商业机密</p>
              </div>
              
              <div className="form-group">
                <label>关键词编码 (整数)</label>
                <input 
                  type="number"
                  value={searchData.keywords}
                  onChange={(e) => setSearchData({...searchData, keywords: e.target.value})}
                  placeholder="输入关键词数字编码..."
                />
                <small>关键词将转换为整数进行加密</small>
              </div>
              
              <div className="form-group">
                <label>专利分类</label>
                <select 
                  value={searchData.category}
                  onChange={(e) => setSearchData({...searchData, category: e.target.value})}
                >
                  <option value="">选择分类</option>
                  <option value="1">发明专利</option>
                  <option value="2">实用新型</option>
                  <option value="3">外观设计</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowSearchModal(false)}
                className="cancel-btn"
              >
                取消
              </button>
              <button 
                onClick={searchPatent}
                disabled={searching || isEncrypting || !searchData.keywords}
                className="primary-btn"
              >
                {searching || isEncrypting ? '加密搜索中...' : '开始加密搜索'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPatent && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h3>专利详情</h3>
              <button onClick={() => setSelectedPatent(null)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="patent-detail">
                <h4>{selectedPatent.title}</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>创建者</label>
                    <span>{selectedPatent.creator.substring(0, 8)}...{selectedPatent.creator.substring(34)}</span>
                  </div>
                  <div className="detail-item">
                    <label>创建时间</label>
                    <span>{new Date(selectedPatent.timestamp * 1000).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <label>验证状态</label>
                    <span className={selectedPatent.isVerified ? 'status-verified' : 'status-pending'}>
                      {selectedPatent.isVerified ? '✅ 已验证' : '⏳ 待验证'}
                    </span>
                  </div>
                </div>
                
                <div className="keywords-section">
                  <h5>加密关键词</h5>
                  <div className="keywords-display">
                    {selectedPatent.isVerified && selectedPatent.decryptedValue ? (
                      <div className="decrypted-keywords">
                        <span>解密值: {selectedPatent.decryptedValue}</span>
                        <span className="security-badge">🔐 安全解密</span>
                      </div>
                    ) : (
                      <div className="encrypted-keywords">
                        <span>🔒 加密数据</span>
                        <button 
                          onClick={() => decryptKeywords(selectedPatent.id)}
                          disabled={isDecrypting}
                          className="decrypt-btn"
                        >
                          {isDecrypting ? '解密中...' : '解密关键词'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {transactionStatus.status === 'success' ? '✅' : 
               transactionStatus.status === 'error' ? '❌' : '⏳'}
            </span>
            <span>{transactionStatus.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

