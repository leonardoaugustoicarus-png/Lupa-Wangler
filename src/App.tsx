
import React, { useState, useRef, useEffect } from 'react';
import { ContrastMode, AppSettings, RecognitionResult, HistoryItem } from './types';
import { analyzeMedicalDocument, generateSpeech, decodeAudioData } from './services/geminiService';

/**
 * Lupa Saúde Acessível - Componente Principal
 * Focado em acessibilidade visual e processamento de documentos médicos via IA.
 */
const App: React.FC = () => {
  // Configurações e estados de UI
  const [settings, setSettings] = useState<AppSettings>({
    fontSize: 28,
    contrastMode: ContrastMode.NORMAL,
    audioEnabled: true,
    zoomLevel: 1
  });

  const [isFrozen, setIsFrozen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Referências para elementos de hardware e mídia
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inicialização do histórico local e da câmera
  useEffect(() => {
    const saved = localStorage.getItem('lupa_history');
    if (saved) setHistory(JSON.parse(saved));

    // Tenta iniciar a câmera automaticamente
    startCamera();

    return stopCamera;
  }, []);

  // Salva resultado no histórico local (limite de 10 itens)
  const saveToHistory = (res: RecognitionResult) => {
    const newItem: HistoryItem = {
      ...res,
      id: Date.now().toString(),
      date: new Date().toLocaleString('pt-BR')
    };
    const updated = [newItem, ...history].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('lupa_history', JSON.stringify(updated));
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    stopCamera();
    setCameraError(null);

    // Verificação de Contexto Seguro (HTTPS)
    if (!window.isSecureContext) {
      setCameraError("Acesso à câmera bloqueado por segurança. O site precisa estar em uma conexão HTTPS segura.");
      setCameraActive(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Seu navegador não suporta acesso à câmera ou bloqueou o acesso. Tente o Chrome ou Safari atualizados.");
      setCameraActive(false);
      return;
    }

    try {
      // Primeira tentativa: Alta resolução e câmera traseira
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn("Erro 1 (HD):", err.name, err.message);

      try {
        // Segunda tentativa: SD e câmera traseira
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraActive(true);
        }
      } catch (err2: any) {
        console.warn("Erro 2 (SD):", err2.name, err2.message);

        try {
          // Última tentativa: Configurações mínimas absolutas
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            setCameraActive(true);
          }
        } catch (fallbackErr: any) {
          console.error("Falha final na câmera:", fallbackErr);
          setCameraActive(false);

          const errorName = fallbackErr.name || "UnknownError";
          const errorMessage = fallbackErr.message || "";

          if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
            setCameraError(`Permissão negada (${errorName}). Toque no cadeado na barra de endereços para permitir a câmera.`);
          } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
            setCameraError(`Câmera não encontrada (${errorName}).`);
          } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
            setCameraError(`Câmera em uso por outro app (${errorName}). Feche outros apps e tente de novo.`);
          } else {
            setCameraError(`Erro técnico: ${errorName}. ${errorMessage}. Tente carregar uma foto.`);
          }
        }
      }
    }
  };

  const triggerHaptic = (type: 'light' | 'heavy' = 'light') => {
    if (window.navigator.vibrate) {
      window.navigator.vibrate(type === 'heavy' ? [100, 50, 100] : 50);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    const shareText = `*Lupa Saúde - Resumo da Receita*\n\n${result.summary}\n\n*Medicamentos:* ${result.medications.join(', ')}\n${result.crm ? `*CRM:* ${result.crm}` : ''}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Resumo de Receita Médica',
          text: shareText
        });
      } catch (err) {
        console.warn("Erro ao compartilhar", err);
      }
    } else {
      navigator.clipboard.writeText(shareText);
      alert("Texto copiado para a área de transferência!");
    }
  };

  // Envia imagem para análise via Gemini API
  const processImageContent = async (base64Image: string) => {
    setIsFrozen(true);
    setIsProcessing(true);
    setResult(null);

    try {
      const analysis = await analyzeMedicalDocument(base64Image);
      setResult(analysis);
      saveToHistory(analysis);
      if (settings.audioEnabled && analysis.summary) {
        playAudio(analysis.summary);
      }
    } catch (error: any) {
      console.error("Erro na análise:", error);
      const technicalDetails = error.message || JSON.stringify(error);
      alert(`Erro ao analisar documento: ${technicalDetails}\n\nDICA: Verifique se a GEMINI_API_KEY está configurada no Vercel.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d')?.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
          processImageContent(base64);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMainAction = async () => {
    triggerHaptic('heavy');
    if (isFrozen) {
      setIsFrozen(false);
      setResult(null);
      return;
    }
    if (!cameraActive) {
      fileInputRef.current?.click();
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const base64Image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      processImageContent(base64Image);
    }
  };

  const playAudio = async (text: string) => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const audioBytes = await generateSpeech(text);
      const audioBuffer = await decodeAudioData(audioBytes, ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (err) {
      console.error("Erro de áudio:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white overflow-hidden font-sans select-none">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

      {/* Viewport Principal com Filtros de Acessibilidade */}
      <div className={`flex-1 relative overflow-hidden bg-zinc-900 ${settings.contrastMode === 'yellow' ? 'contrast-yellow' : settings.contrastMode === 'dark' ? 'contrast-dark' : 'contrast-high'}`}>
        {cameraActive ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transition-transform duration-200 origin-center" style={{ transform: `scale(${settings.zoomLevel})` }} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-zinc-900 z-0">
            {cameraError ? (
              <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/50">
                  <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight">Câmera Indisponível</h2>
                <p className="text-zinc-400 text-sm max-w-xs mx-auto leading-relaxed">{cameraError}</p>
                <div className="flex flex-col gap-3 max-w-xs mx-auto">
                  <button
                    onClick={() => startCamera()}
                    className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-blue-600/20"
                  >
                    Tentar Novamente
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(cameraError || "No error");
                      alert("Erro técnico copiado!");
                    }}
                    className="bg-zinc-800 text-zinc-400 px-4 py-2 rounded-xl text-[10px] font-bold uppercase border border-white/5 active:bg-zinc-700"
                  >
                    Copiar Erro para Suporte
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-8 animate-in fade-in duration-700">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-blue-500/20 rounded-full" />
                  <div className="absolute inset-0 w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="space-y-4">
                  <p className="font-black uppercase tracking-widest text-blue-400 text-sm">Aguardando Câmera...</p>
                  <p className="text-zinc-500 text-xs px-4">Se o prompt de permissão não aparecer, você pode carregar uma imagem manualmente:</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-zinc-800 text-white px-6 py-3 rounded-xl font-bold text-sm border border-white/5 active:scale-95 transition-all"
                  >
                    Carregar Foto da Galeria
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 origin-center ${isFrozen ? 'opacity-100' : 'opacity-0'}`} style={{ transform: `scale(${settings.zoomLevel})` }} />

        {/* HUD de Scan e Slider de Zoom */}
        {!isFrozen && (
          <>
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-white/30 rounded-3xl animate-pulse flex items-center justify-center">
                  <div className="w-full h-0.5 bg-blue-500 shadow-[0_0_15px_blue] absolute animate-bounce" />
                </div>
              </div>
            )}

            {/* Slider de Zoom Vertical - Essencial para Baixa Visão */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-30">
              <div className="bg-black/50 backdrop-blur-md px-3 py-2 rounded-xl text-xs font-black text-blue-400 border border-white/10">
                {settings.zoomLevel.toFixed(1)}x
              </div>
              <div className="h-64 w-12 bg-black/40 backdrop-blur-lg rounded-full border border-white/10 relative flex items-center justify-center group active:bg-black/60 transition-colors">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  aria-label="Ajuste de Zoom"
                  value={settings.zoomLevel}
                  onChange={(e) => setSettings(s => ({ ...s, zoomLevel: parseFloat(e.target.value) }))}
                  style={{
                    appearance: 'none',
                    width: '240px',
                    height: '40px',
                    transform: 'rotate(-90deg)',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                  className="absolute cursor-pointer"
                />
                <div className="absolute inset-x-0 bottom-0 top-0 pointer-events-none flex flex-col justify-between items-center py-8">
                  <div className="w-1.5 h-1.5 bg-white/20 rounded-full" />
                  <div className="w-2.5 h-2.5 bg-white/40 rounded-full" />
                  <div className="w-1.5 h-1.5 bg-white/20 rounded-full" />
                </div>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, zoomLevel: 1 }))}
                title="Resetar Zoom"
                className="p-3 bg-white/10 backdrop-blur-md rounded-full active:scale-90 transition-transform"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* Modal de Resultado (Overlay) */}
        {isFrozen && (
          <div className="absolute inset-0 bg-black/60 flex flex-col p-4 overflow-y-auto z-10">
            <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-2xl transition-all" style={{ fontSize: `${settings.fontSize}px` }}>
              {isProcessing ? (
                <div className="flex flex-col items-center gap-6 py-10">
                  <div className="w-16 h-16 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="font-black uppercase tracking-tighter">IA Consultando Google...</p>
                </div>
              ) : result ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-wrap gap-2">
                      {result.crm && <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-black uppercase">{result.crm}</span>}
                      {result.cro && <span className="bg-green-600 text-white px-4 py-1 rounded-full text-sm font-black uppercase">{result.cro}</span>}
                    </div>
                    <button onClick={handleShare} className="p-3 bg-zinc-100 rounded-2xl active:scale-90 transition-transform">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    </button>
                  </div>

                  <div className="border-l-[12px] border-blue-500 pl-4">
                    <p className="text-xs font-black uppercase opacity-40 mb-1">Como usar</p>
                    <p className="font-bold leading-tight text-blue-900">{result.summary}</p>
                  </div>

                  {result.references && result.references.length > 0 && (
                    <div className="bg-zinc-50 p-4 rounded-3xl">
                      <p className="text-[10px] font-black uppercase opacity-40 mb-2">Validado via Google Search</p>
                      {result.references.map((ref, idx) => (
                        <a key={idx} href={ref.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold block truncate text-base mb-1 underline">
                          🔗 {ref.title}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="pt-4 border-t border-zinc-100">
                    <p className="text-[10px] font-black uppercase opacity-30 mb-1">Medicamentos</p>
                    <div className="flex flex-wrap gap-2">
                      {result.medications.map((m, i) => (
                        <span key={i} className="bg-yellow-200 px-3 py-1 rounded-xl font-black text-sm uppercase">{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center"><p className="text-red-600 font-black">Falha na leitura.</p></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer - Barra de Comandos Principais */}
      <div className="h-44 bg-zinc-950 flex items-center justify-around px-4 pb-8 border-t border-white/5 z-20">
        <button onClick={() => setShowHistory(true)} aria-label="Histórico" className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center active:scale-90 transition-all">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>

        <button onClick={handleMainAction} aria-label={isFrozen ? "Sair" : (cameraActive ? "Capturar" : "Carregar")} className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all active:scale-95 shadow-2xl ${isFrozen ? 'bg-red-600' : 'bg-white text-black'}`}>
          {isFrozen ? (
            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          ) : (
            <div className="w-20 h-20 rounded-full border-4 border-zinc-200 bg-white" />
          )}
        </button>

        <button onClick={() => setShowSettings(true)} aria-label="Configurações" className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center active:scale-90 transition-all">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </div>

      {/* Modais - Histórico e Ajustes */}
      {showHistory && (
        <div className="fixed inset-0 bg-black z-50 p-6 flex flex-col animate-in slide-in-from-left duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black uppercase tracking-tight">Últimas Receitas</h2>
            <button onClick={() => setShowHistory(false)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black">FECHAR</button>
          </div>
          <div className="space-y-4 overflow-y-auto">
            {history.length === 0 && <p className="opacity-40 text-center py-20">Nenhuma receita salva no momento.</p>}
            {history.map((item) => (
              <button key={item.id} onClick={() => { setResult(item); setIsFrozen(true); setShowHistory(false); }} className="w-full bg-zinc-900 p-5 rounded-3xl text-left border-l-4 border-blue-500 active:scale-[0.98] transition-all">
                <p className="font-black text-sm mb-1 truncate">{item.medications[0] || 'Análise de Receita'}</p>
                <p className="text-xs opacity-40">{item.date}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/95 z-50 p-8 flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-3xl font-black uppercase tracking-tighter">Ajustes</h2>
            <button onClick={() => setShowSettings(false)} className="bg-white text-black px-6 py-3 rounded-2xl font-black uppercase">PRONTO</button>
          </div>
          <div className="space-y-12">
            <section>
              <h3 className="text-sm font-black uppercase opacity-40 mb-4 tracking-widest">Tamanho da Fonte</h3>
              <div className="flex items-center gap-4">
                <button onClick={() => setSettings(s => ({ ...s, fontSize: Math.max(20, s.fontSize - 4) }))} className="flex-1 bg-zinc-800 p-6 rounded-3xl text-4xl font-black">-</button>
                <button onClick={() => setSettings(s => ({ ...s, fontSize: Math.min(60, s.fontSize + 4) }))} className="flex-1 bg-zinc-800 p-6 rounded-3xl text-4xl font-black">+</button>
              </div>
            </section>
            <section>
              <h3 className="text-sm font-black uppercase opacity-40 mb-4 tracking-widest">Esquema de Cores</h3>
              <div className="grid grid-cols-3 gap-3">
                {['normal', 'dark', 'yellow'].map(mode => (
                  <button key={mode} onClick={() => setSettings(s => ({ ...s, contrastMode: mode as ContrastMode }))} className={`p-5 rounded-2xl font-black text-[10px] uppercase border-4 transition-all ${settings.contrastMode === mode ? 'border-blue-600 scale-105' : 'border-zinc-800 opacity-50'}`}>
                    {mode === 'yellow' ? 'Amarelo' : mode === 'dark' ? 'Invertido' : 'Padrão'}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
