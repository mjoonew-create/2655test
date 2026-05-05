import { useState, useMemo, useCallback, useRef, ChangeEvent, useEffect, MouseEvent } from 'react';
import { 
  Users, 
  Shuffle, 
  Copy, 
  Trash2, 
  Settings2,
  Check,
  RotateCcw,
  UserPlus,
  Star,
  Heart,
  Circle,
  FileUp,
  FileDown,
  Download,
  ExternalLink,
  LogOut,
  LayoutDashboard,
  Save,
  History,
  X,
  Bookmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type GroupingMode = 'count' | 'size';

interface Person {
  name: string;
  gender: 'M' | 'F' | 'None';
}

interface Group {
  id: number;
  members: Person[];
}

interface SavedHistory {
  id: string;
  timestamp: number;
  title: string;
  groups: Group[];
  totalPeople: number;
  userIdentity: Person | null;
  logs: string[];
}

const FloatingDecorations = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={`star-${i}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0.2, 0.5, 0.2], 
            scale: [1, 1.2, 1],
            y: [-20, 20, -20],
            rotate: [0, 90, 0]
          }}
          transition={{ 
            duration: 5 + i, 
            repeat: Infinity, 
            delay: i * 0.5 
          }}
          className="absolute text-violet-200"
          style={{ 
            top: `${Math.random() * 80 + 10}%`, 
            left: `${Math.random() * 90}%` 
          }}
        >
          <Star size={16 + i * 4} fill="currentColor" />
        </motion.div>
      ))}
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={`heart-${i}`}
          animate={{ 
            y: [0, -40, 0],
            x: [0, 20, 0],
            opacity: [0.1, 0.3, 0.1]
          }}
          transition={{ duration: 7, repeat: Infinity, delay: i * 1 }}
          className="absolute text-rose-200"
          style={{ 
            bottom: `${Math.random() * 30 + 10}%`, 
            right: `${Math.random() * 20 + 5}%` 
          }}
        >
          <Heart size={24 + i * 8} fill="currentColor" />
        </motion.div>
      ))}
    </div>
  );
};

export default function App() {
  const [namesInput, setNamesInput] = useState('');
  const [mode, setMode] = useState<GroupingMode>('count');
  const [value, setValue] = useState(2);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useGender, setUseGender] = useState(false);
  const [isGoogleAuth, setIsGoogleAuth] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [userIdentity, setUserIdentity] = useState<Person | null>(null);
  const [customIdentity, setCustomIdentity] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>(['系統初始化完成']);
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((action: string) => {
    const time = new Date().toLocaleTimeString();
    setActionLog(prev => [`[${time}] ${action}`, ...prev].slice(0, 20));
  }, []);

  // Check auth status and load history on mount
  useEffect(() => {
    fetch('/api/auth/google/status')
      .then(res => res.json())
      .then(data => setIsGoogleAuth(data.isAuthenticated))
      .catch(() => setIsGoogleAuth(false));

    const saved = localStorage.getItem('grouping_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

  const saveHistoryToLocal = (newHistory: SavedHistory[]) => {
    setHistory(newHistory);
    localStorage.setItem('grouping_history', JSON.stringify(newHistory));
  };

  const handleSaveCurrent = () => {
    if (groups.length === 0) return;
    
    const newEntry: SavedHistory = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      title: `${new Date().toLocaleTimeString()} 的分組`,
      groups: JSON.parse(JSON.stringify(groups)), 
      totalPeople: groups.reduce((acc, g) => acc + g.members.length, 0),
      userIdentity: userIdentity,
      logs: [...actionLog]
    };

    const updated = [newEntry, ...history].slice(0, 50); 
    saveHistoryToLocal(updated);
    addLog(`成功儲存紀錄：${newEntry.title}`);
    
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteHistory = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    saveHistoryToLocal(updated);
    addLog(`刪除紀錄：${id}`);
  };

  const handleRestoreHistory = (item: SavedHistory) => {
    setGroups(item.groups);
    setUserIdentity(item.userIdentity);
    setActionLog(item.logs);
    setShowHistory(false);
    addLog(`載入紀錄：${item.title}`);
  };

  // Listen for OAuth messages
  useEffect(() => {
    const handleLoginMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGoogleAuth(true);
        // Trigger export if it was pending
        if (groups.length > 0) {
          handleExportToSheets();
        }
      }
    };
    window.addEventListener('message', handleLoginMessage);
    return () => window.removeEventListener('message', handleLoginMessage);
  }, [groups]);

  const parsedPeople = useMemo(() => {
    return namesInput
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        
        let gender: 'M' | 'F' | 'None' = 'None';
        let name = trimmed;

        if (/\(男\)|（男）|\(M\)|\(m\)/i.test(trimmed)) {
          gender = 'M';
          name = trimmed.replace(/\(男\)|（男）|\(M\)|\(m\)/gi, '').trim();
        } else if (/\(女\)|（女）|\(F\)|\(f\)/i.test(trimmed)) {
          gender = 'F';
          name = trimmed.replace(/\(女\)|（女）|\(F\)|\(f\)/gi, '').trim();
        }
        
        return { name, gender };
      })
      .filter((p): p is Person => p !== null);
  }, [namesInput]);

  const handleGenerate = useCallback(() => {
    if (parsedPeople.length === 0) return;
    
    setIsGenerating(true);
    
    setTimeout(() => {
      let result: Group[] = [];
      addLog(`開始分組：模式=${mode === 'count' ? '指定組數' : '每組人數'}, 數值=${value}, 包含性別=${useGender ? '是' : '否'}`);
      
      const shuffle = <T,>(array: T[]): T[] => {
        return [...array].sort(() => Math.random() - 0.5);
      };

      if (useGender) {
        const males: Person[] = shuffle(parsedPeople.filter(p => p.gender === 'M'));
        const females: Person[] = shuffle(parsedPeople.filter(p => p.gender === 'F'));
        const others: Person[] = shuffle(parsedPeople.filter(p => p.gender === 'None'));

        const performGrouping = (peopleList: Person[], baseId: number) => {
          const listResult: Group[] = [];
          if (peopleList.length === 0) return listResult;

          if (mode === 'count') {
            const numGroups = Math.max(1, Math.min(value, peopleList.length));
            for (let i = 0; i < numGroups; i++) {
              listResult.push({ id: baseId + i, members: [] });
            }
            peopleList.forEach((person, index) => {
              listResult[index % numGroups].members.push(person);
            });
          } else {
            const groupSize = Math.max(1, value);
            for (let i = 0; i < peopleList.length; i += groupSize) {
              listResult.push({
                id: baseId + listResult.length,
                members: [...peopleList.slice(i, i + groupSize)]
              });
            }
          }
          return listResult;
        };

        const maleGroups = performGrouping(males, 1);
        const femaleGroups = performGrouping(females, maleGroups.length + 1);
        const otherGroups = performGrouping(others, maleGroups.length + femaleGroups.length + 1);
        
        result = [...maleGroups, ...femaleGroups, ...otherGroups];
      } else {
        const shuffled: Person[] = shuffle(parsedPeople);
        if (mode === 'count') {
          const numGroups = Math.max(1, Math.min(value, shuffled.length));
          for (let i = 0; i < numGroups; i++) {
            result.push({ id: i + 1, members: [] });
          }
          shuffled.forEach((person, index) => {
            result[index % numGroups].members.push(person);
          });
        } else {
          const groupSize = Math.max(1, value);
          for (let i = 0; i < shuffled.length; i += groupSize) {
            result.push({
              id: result.length + 1,
              members: [...shuffled.slice(i, i + groupSize)]
            });
          }
        }
      }
      
      setGroups(result);
      setIsGenerating(false);
    }, 800);
  }, [parsedPeople, mode, value, useGender]);

  const handleCopy = useCallback(() => {
    if (groups.length === 0) return;
    
    const text = groups
      .map(g => `第 ${g.id} 組：\n${g.members.map(m => `• ${m.name}${m.gender !== 'None' ? ` (${m.gender === 'M' ? '男' : '女'})` : ''}`).join('\n')}`)
      .join('\n\n');
    
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [groups]);

  const handleClear = () => {
    setNamesInput('');
    setGroups([]);
  };

  const handleImportSample = () => {
    const sample = [
      '陳大文 (男)', '林小明 (男)', '張愛玲 (女)', '杜甫 (男)', '李清照 (女)', 
      '蘇東坡 (男)', '三毛 (女)', '白居易 (男)', '王維 (男)', '席慕蓉 (女)',
      '魯迅 (男)', '沈從文 (男)', '林徽因 (女)', '冰心 (女)', '金庸 (男)'
    ].join('\n');
    setNamesInput(sample);
    addLog('匯入範例名單');
  };

  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addLog(`選擇檔案：${file.name}`);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setNamesInput(content);
        addLog('文件內容匯入成功');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportFile = (format: 'txt' | 'csv') => {
    if (groups.length === 0) return;
    addLog(`匯出文件：${format}`);
    let content = '';
    let fileName = '';
    let type = '';

    if (format === 'txt') {
      content = groups
        .map(g => `第 ${g.id} 組：\n${g.members.map(m => `• ${m.name}${m.gender !== 'None' ? ` (${m.gender === 'M' ? '男' : '女'})` : ''}`).join('\n')}`)
        .join('\n\n');
      fileName = `分組結果_${new Date().toLocaleDateString()}.txt`;
      type = 'text/plain';
    } else {
      // CSV format for Spreadsheets
      // Header: No spaces after commas for CSV
      content = '組別,姓名,性別\n' + groups
        .flatMap(g => g.members.map(m => `${g.id},${m.name},${m.gender === 'M' ? '男' : m.gender === 'F' ? '女' : '-'}`))
        .join('\n');
      fileName = `分組結果_${new Date().toLocaleDateString()}.csv`;
      type = 'text/csv;charset=utf-8';
    }
    
    // Add BOM for better compatibility with Excel/Sheets
    const blob = new Blob([format === 'csv' ? '\uFEFF' + content : content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [copyFeedback, setCopyFeedback] = useState<'none' | 'text' | 'sheets'>('none');

  const handleCopyText = () => {
    if (groups.length === 0) return;
    const text = groups
      .map(g => `第 ${g.id} 組：\n${g.members.map(m => `• ${m.name}${m.gender !== 'None' ? ` (${m.gender === 'M' ? '男' : '女'})` : ''}`).join('\n')}`)
      .join('\n\n');
    
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback('text');
      setTimeout(() => setCopyFeedback('none'), 2000);
    });
  };

  const handleCopyForSheets = () => {
    if (groups.length === 0) return;
    
    // Using tabs ensures it pastes correctly into Google Sheets cells
    const header = '組別\t姓名\t性別\n';
    const body = groups
      .flatMap(g => g.members.map(m => `${g.id}\t${m.name}\t${m.gender === 'M' ? '男' : m.gender === 'F' ? '女' : '-'}`))
      .join('\n');
    
    navigator.clipboard.writeText(header + body).then(() => {
      setCopyFeedback('sheets');
      setTimeout(() => setCopyFeedback('none'), 2000);
    });
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      if (data.error) {
        setErrorMsg(data.error);
        return;
      }
      window.open(data.url, 'google_auth', 'width=600,height=700');
    } catch (err) {
      setErrorMsg('無法連接到伺服器');
    }
  };

  const handleExportToSheets = async () => {
    if (groups.length === 0) return;
    if (!isGoogleAuth) {
      handleGoogleLogin();
      return;
    }

    setIsExporting(true);
    setExportUrl(null);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/export/google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groups,
          title: `分組結果_${new Date().toLocaleDateString()}`
        })
      });

      const data = await response.json();
      if (data.success) {
        setExportUrl(data.url);
      } else {
        if (response.status === 401) {
          setIsGoogleAuth(false);
          setErrorMsg('連線已過期，請重新登入');
        } else {
          setErrorMsg(data.error || '匯出失敗');
        }
      }
    } catch (err) {
      setErrorMsg('網路錯誤');
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsGoogleAuth(false);
      setExportUrl(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFF] text-[#2D2D35] font-sans relative overflow-x-hidden">
      <FloatingDecorations />
      
      {/* Header */}
      <header className="border-b border-white/40 bg-white/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ rotate: 15, scale: 1.1 }}
              className="bg-gradient-to-br from-violet-500 to-fuchsia-500 p-2.5 rounded-2xl text-white shadow-lg shadow-violet-200"
            >
              <Users size={24} />
            </motion.div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600">
                分組小工具
              </h1>
              <p className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">Fair & Cute v3.0</p>
            </div>
          </div>
            <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2.5 rounded-xl transition-all relative ${showHistory ? 'bg-violet-500 text-white' : 'text-gray-400 hover:text-violet-500 hover:bg-violet-50'}`}
              title="歷史紀錄"
            >
              <History size={22} />
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                  {history.length}
                </span>
              )}
            </button>
            {isGoogleAuth && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-wider">Google Sheets Linked</span>
                <button onClick={handleLogout} className="ml-1 p-1 hover:bg-emerald-100 rounded-md transition-colors" title="登出 Google">
                  <LogOut size={12} />
                </button>
              </div>
            )}
            <button 
              onClick={handleClear}
              className="p-2.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
              title="清除所有"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
        {/* Input Section */}
        <section className="lg:col-span-5 space-y-8">
          <div className="bg-white/80 backdrop-blur-sm rounded-[32px] border border-white p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="flex items-center gap-2.5 font-bold text-gray-800">
                <UserPlus size={20} className="text-violet-500" />
                名單輸入
                <span className="text-[11px] font-bold bg-violet-50 text-violet-500 px-2.5 py-1 rounded-lg">
                  {parsedPeople.length} PEOPLE
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFile}
                  accept=".txt,.csv"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-violet-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all"
                  title="匯入文件"
                >
                  <FileUp size={18} />
                </button>
                <button
                  onClick={handleImportSample}
                  className="text-[10px] font-black text-violet-500 hover:text-white hover:bg-violet-500 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-xl transition-all uppercase tracking-wider"
                >
                  實例
                </button>
              </div>
            </div>
            <textarea
              ref={textAreaRef}
              value={namesInput}
              onChange={(e) => setNamesInput(e.target.value)}
              placeholder="輸入名字，每行一人... 加上 (男) 或 (女) 可自動識別性別！"
              className="w-full h-72 p-5 bg-gray-50/50 border-2 border-transparent rounded-[24px] focus:ring-0 focus:border-violet-200 focus:bg-white transition-all resize-none text-sm leading-relaxed placeholder:text-gray-300"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 rounded-lg text-[10px] font-black text-sky-500 border border-sky-100 uppercase">
                <Circle size={8} fill="currentColor" />
                男生: {parsedPeople.filter(p => p.gender === 'M').length}
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 rounded-lg text-[10px] font-black text-rose-500 border border-rose-100 uppercase">
                <Circle size={8} fill="currentColor" />
                女生: {parsedPeople.filter(p => p.gender === 'F').length}
              </div>

              {parsedPeople.length > 0 && (
                <div className="w-full mt-2 space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">誰在操作？</p>
                  <div className="flex gap-2">
                    <select 
                      value={showCustomInput ? 'custom' : (userIdentity?.name || '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setShowCustomInput(true);
                          setUserIdentity(null);
                        } else {
                          setShowCustomInput(false);
                          const found = parsedPeople.find(p => p.name === val);
                          setUserIdentity(found || null);
                          addLog(`切換使用者身份：${found?.name || '訪客'}`);
                        }
                      }}
                      className="flex-1 bg-white border-2 border-violet-100 text-violet-600 font-bold text-xs py-2 px-3 rounded-xl focus:ring-0 focus:border-violet-300 transition-all outline-none"
                    >
                      <option value="">-- 選擇身份 --</option>
                      {parsedPeople.map((p, i) => (
                        <option key={i} value={p.name}>{p.name} {p.gender !== 'None' ? `(${p.gender === 'M' ? '男' : '女'})` : ''}</option>
                      ))}
                      <option value="custom">+ 其他名稱 (手動輸入)</option>
                    </select>
                  </div>
                  
                  {showCustomInput && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2"
                    >
                      <input 
                        type="text"
                        value={customIdentity}
                        onChange={(e) => {
                          const name = e.target.value;
                          setCustomIdentity(name);
                          setUserIdentity(name ? { name, gender: 'None' } : null);
                        }}
                        onBlur={() => {
                          if (customIdentity) addLog(`設定臨時身份：${customIdentity}`);
                        }}
                        placeholder="請輸入您的稱呼..."
                        className="flex-1 bg-violet-50 border-2 border-violet-200 text-violet-700 font-bold text-xs py-2 px-3 rounded-xl outline-none focus:border-violet-400 transition-all"
                      />
                      <button 
                        onClick={() => {
                          setShowCustomInput(false);
                          setUserIdentity(null);
                          setCustomIdentity('');
                        }}
                        className="p-2 text-gray-400 hover:text-rose-500"
                      >
                        <X size={16} />
                      </button>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Log Section */}
          <div className="bg-white/40 backdrop-blur-sm rounded-[32px] border border-white/60 p-6 shadow-sm overflow-hidden h-48 flex flex-col">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
              操作日誌
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
              {actionLog.map((log, i) => (
                <p key={i} className="text-[10px] font-medium text-gray-400 font-mono flex gap-2">
                  <span className="opacity-40">{log.split(' ')[0]}</span>
                  <span>{log.split(' ').slice(1).join(' ')}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-[32px] border border-white p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-bold text-gray-800">
                <Settings2 size={20} className="text-violet-500" />
                設定規則
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer group">
                <span className="text-[10px] font-black text-gray-400 group-hover:text-violet-500 transition-colors uppercase tracking-wider">同性別分組</span>
                <div 
                  onClick={() => setUseGender(!useGender)}
                  className={`w-10 h-5 rounded-full p-1 transition-all ${useGender ? 'bg-violet-500' : 'bg-gray-200'}`}
                >
                  <motion.div 
                    animate={{ x: useGender ? 20 : 0 }}
                    className="w-3 h-3 bg-white rounded-full shadow-sm"
                  />
                </div>
              </label>
            </div>

            <div className="flex bg-gray-100/50 p-1.5 rounded-[18px]">
              <button
                onClick={() => setMode('count')}
                className={`flex-1 py-2.5 px-4 rounded-[14px] text-sm font-bold transition-all ${
                  mode === 'count' 
                    ? 'bg-white text-violet-600 shadow-md' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                分組數量
              </button>
              <button
                onClick={() => setMode('size')}
                className={`flex-1 py-2.5 px-4 rounded-[14px] text-sm font-bold transition-all ${
                  mode === 'size' 
                    ? 'bg-white text-violet-600 shadow-md' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                每組人數
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{mode === 'count' ? 'Groups' : 'Per Group'}</span>
                <span className="text-sm font-black text-violet-600">{value}</span>
              </div>
              <input
                type="range"
                min="1"
                max={Math.max(20, parsedPeople.length)}
                value={value}
                onChange={(e) => setValue(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-full appearance-none cursor-pointer accent-violet-500"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={parsedPeople.length === 0 || isGenerating}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed text-white py-5 rounded-[24px] font-bold shadow-xl shadow-violet-200/50 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {isGenerating ? (
                <RotateCcw className="animate-spin" size={22} />
              ) : (
                <>
                  <Shuffle size={22} className="group-hover:rotate-180 transition-transform duration-700" />
                  <span className="text-lg">開始分組</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Results Section */}
        <section className="lg:col-span-7">
          <div className="bg-white/80 backdrop-blur-sm rounded-[40px] border border-white min-h-[640px] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="p-8 border-b border-gray-50/50 flex flex-col md:flex-row md:items-center justify-between bg-white/50 gap-4">
              <h2 className="font-black text-xl text-gray-800 flex items-center gap-3">
                分組結果
                {groups.length > 0 && (
                  <span className="text-xs font-bold bg-violet-500 text-white px-3 py-1 rounded-full animate-in zoom-in">
                    {groups.length} TEAMS
                  </span>
                )}
              </h2>
              {groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveCurrent}
                    className="p-2.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-2xl transition-all flex items-center gap-2 border-2 border-amber-100"
                    title="儲存此次結果"
                  >
                    <Bookmark size={18} fill={groups.length > 0 ? "currentColor" : "none"} />
                    <span className="text-[10px] font-black uppercase">儲存紀錄</span>
                  </button>
                  <div className="flex bg-violet-100/50 p-1 rounded-2xl">
                    <button
                      onClick={() => handleExportFile('csv')}
                      className="p-2.5 text-violet-500 hover:text-violet-700 hover:bg-white rounded-xl transition-all flex items-center gap-2"
                      title="下載 CSV 檔案"
                    >
                      <Download size={18} />
                      <span className="text-[10px] font-black uppercase">CSV</span>
                    </button>
                    <button
                      onClick={() => handleExportFile('txt')}
                      className="p-2.5 text-violet-400 hover:text-violet-600 hover:bg-white rounded-xl transition-all"
                      title="下載文字檔"
                    >
                      <FileUp size={18} />
                    </button>
                  </div>
                  
                  <div className="flex gap-2">
                    {exportUrl ? (
                      <a
                        href={exportUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-2xl transition-all border-2 bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100"
                      >
                        <ExternalLink size={16} />
                        <span>開啟試算表</span>
                      </a>
                    ) : (
                      <button
                        onClick={handleExportToSheets}
                        disabled={isExporting}
                        className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-2xl transition-all active:scale-95 border-2 ${
                          isGoogleAuth 
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100' 
                          : 'bg-white border-gray-100 text-gray-400 hover:border-violet-200 hover:text-violet-500'
                        }`}
                      >
                        {isExporting ? <RotateCcw size={16} className="animate-spin" /> : <LayoutDashboard size={16} />}
                        <span>{isExporting ? '匯出中...' : (isGoogleAuth ? '連動 Google 試算表' : '連動 Google 試算表')}</span>
                      </button>
                    )}

                    <button
                      onClick={handleCopyForSheets}
                      className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-2xl transition-all active:scale-95 border-2 ${
                        copyFeedback === 'sheets' 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : 'bg-violet-50 border-violet-100 text-violet-600 hover:bg-violet-100'
                      }`}
                    >
                      {copyFeedback === 'sheets' ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copyFeedback === 'sheets' ? '格式已複製' : '複製到試算表'}</span>
                    </button>
                    
                    <button
                      onClick={handleCopyText}
                      className={`p-2.5 rounded-2xl transition-all border-2 ${
                        copyFeedback === 'text'
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-white border-gray-100 text-gray-400 hover:border-violet-200 hover:text-violet-500'
                      }`}
                      title="複製純文字"
                    >
                      {copyFeedback === 'text' ? <Check size={18} /> : <FileDown size={18} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="mx-8 mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <RotateCcw size={14} className="cursor-pointer" onClick={() => setErrorMsg(null)} />
                  {errorMsg}
                </span>
                <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600">✕</button>
              </div>
            )}

            <div className="flex-1 p-8 overflow-y-auto max-h-[720px]">
              <AnimatePresence mode="wait">
                {groups.length > 0 ? (
                  <motion.div 
                    key="results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    {groups.map((group, idx) => (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, scale: 0.8, y: 30 }}
                        animate={{ 
                          opacity: 1, 
                          scale: 1,
                          y: 0,
                          transition: { delay: idx * 0.1, type: 'spring', stiffness: 100, damping: 12 }
                        }}
                        className="relative bg-white rounded-[32px] p-6 border border-gray-50 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all group/card overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-16 h-16 bg-violet-50 rotate-45 translate-x-8 -translate-y-8" />
                        <div className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center text-violet-600 font-black text-[10px] shadow-sm border border-violet-50 z-10">
                          {group.id}
                        </div>
                        
                        <div className="flex items-center gap-2 mb-4">
                          <div className={`w-2 h-2 rounded-full ${group.members[0]?.gender === 'M' ? 'bg-sky-400' : group.members[0]?.gender === 'F' ? 'bg-rose-400' : 'bg-gray-300'}`} />
                          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Team Members</span>
                        </div>
                        
                        <div className="space-y-3">
                          {group.members.map((member, mIdx) => (
                            <motion.div 
                              key={`${group.id}-${mIdx}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.1 + mIdx * 0.05 }}
                              className={`text-[15px] font-semibold py-3 px-4 rounded-2xl transition-all flex items-center justify-between border-2 ${
                                userIdentity?.name === member.name 
                                ? 'bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-200 z-20 scale-105' 
                                : 'bg-gray-50/50 text-gray-600 border-transparent group-hover/card:bg-violet-50/50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {userIdentity?.name === member.name ? (
                                  <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                                  >
                                    <Star size={14} fill="currentColor" />
                                  </motion.div>
                                ) : (
                                  member.gender === 'F' ? <Heart size={14} className="text-rose-400" fill="currentColor" /> : member.gender === 'M' ? <Star size={14} className="text-sky-400" fill="currentColor" /> : <div className="w-1.5 h-1.5 rounded-full bg-violet-200" />
                                )}
                                {member.name}
                                {userIdentity?.name === member.name && (
                                  <span className="text-[8px] bg-white text-violet-600 px-1.5 py-0.5 rounded-full uppercase ml-1">Me</span>
                                )}
                              </div>
                              {member.gender !== 'None' && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase ${
                                  userIdentity?.name === member.name
                                  ? 'bg-violet-400 text-white'
                                  : member.gender === 'M' ? 'bg-sky-100 text-sky-500' : 'bg-rose-100 text-rose-500'
                                }`}>
                                  {member.gender}
                                </span>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center space-y-8 py-20"
                  >
                    <div className="relative group/empty">
                      <div className="absolute inset-0 bg-violet-400 blur-[60px] opacity-20 animate-pulse group-hover/empty:opacity-40 transition-opacity" />
                      <div className="relative bg-white p-14 rounded-[48px] border border-white shadow-xl rotate-6 group-hover/empty:-rotate-6 transition-transform duration-500">
                        <Shuffle size={80} className="text-violet-100" />
                      </div>
                      <div className="absolute -top-4 -right-4 bg-fuchsia-400 p-3 rounded-full text-white shadow-lg animate-bounce">
                        <Heart size={24} fill="currentColor" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-2xl font-black text-gray-800 tracking-tight">準備好要分組了嗎？</p>
                      <p className="text-sm text-gray-400 font-medium px-12 leading-relaxed">
                        在左邊輸入名單，你可以標註 (男) 或 (女)<br />我們會施一點魔法，為你產生最公平可愛的分組
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-20 text-center space-y-6">
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/50 border border-white rounded-[24px] text-[11px] font-bold text-violet-300 uppercase tracking-[0.3em] shadow-sm">
          <span>Magical</span>
          <span className="w-1 h-1 rounded-full bg-violet-200" />
          <span>Fair</span>
          <span className="w-1 h-1 rounded-full bg-violet-200" />
          <span>Simple</span>
        </div>
        <p className="text-xs text-gray-300 font-medium tracking-wide">© 2024 Made with Magic & React · v3.0 Powered</p>
      </footer>

      {/* History Drawer Overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[99]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-[100] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-black text-lg text-gray-800 flex items-center gap-2">
                  <History className="text-violet-500" />
                  歷史存檔
                </h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.length > 0 ? (
                  history.map((item) => (
                    <motion.div
                      layout
                      key={item.id}
                      onClick={() => handleRestoreHistory(item)}
                      className="group p-4 bg-gray-50 hover:bg-violet-50 rounded-2xl border border-transparent hover:border-violet-100 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </p>
                          <h4 className="font-bold text-gray-700 leading-tight">{item.title}</h4>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] font-bold bg-white text-violet-500 px-2 py-0.5 rounded-md border border-violet-100">
                              {item.groups.length} 組
                            </span>
                            <span className="text-[10px] font-bold bg-white text-gray-400 px-2 py-0.5 rounded-md border border-gray-100">
                              {item.totalPeople} 人
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => handleDeleteHistory(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-rose-300 hover:text-rose-500 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="absolute right-0 bottom-0 p-2 text-violet-100 scale-150 rotate-12 opacity-50 group-hover:text-violet-200 transition-colors">
                        <Bookmark size={32} fill="currentColor" />
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-20 px-10">
                    <Bookmark size={48} className="text-gray-100 mb-4" />
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">目前沒有存檔</p>
                    <p className="text-xs text-gray-300 mt-2">點擊分組結果右上角的「儲存紀錄」按鈕來保留您的結果！</p>
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 font-bold text-center uppercase tracking-widest">已儲存在您的瀏覽器中</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
