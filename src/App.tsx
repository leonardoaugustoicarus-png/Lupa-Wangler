import { useState, useRef, useEffect, FC } from 'react';
import { ContrastMode, AppSettings, RecognitionResult, HistoryItem } from './types';
import { analyzeMedicalDocument, generateSpeech, decodeAudioData } from './services/geminiService';

/**
 * Lupa Saúde Acessível - Componente Principal
 * Focado em acessibilidade visual e processamento de documentos médicos via IA.
 */
const App: FC = () => {
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
  const [torchActive, setTorchActive] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(true);
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

    // Verifica se já temos permissão (se o navegador suportar o Permissions API)
    if (navigator.permissions && (navigator.permissions as any).query) {
      navigator.permissions.query({ name: 'camera' as any }).then((result) => {
        if (result.state === 'granted') {
          setNeedsPermission(false);
          startCamera();
        }
      });
    }

    return stopCamera;
  }, []);

  // Sincroniza o stream com o elemento de vídeo quando ele aparece no DOM
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      console.log("Stream sincronizado com o elemento de vídeo");
    }
  }, [cameraActive]);

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
    setTorchActive(false);
    setHasTorch(false);
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
      setNeedsPermission(false);
      return;
    }

    setNeedsPermission(false);

    // Implementação EXATA sugerida pelo usuário para evitar bloqueios
    const constraints = {
      video: {
        facingMode: { ideal: "environment" }
      }
    };

    try {
      // Primeira tentativa: Usando as restrições sugeridas (com HD ideal)
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Checa suporte a lanterna
      const track = stream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const caps = track.getCapabilities() as any;
        setHasTorch(!!caps.torch);
      }

      setCameraActive(true);
      
      // Tentativa imediata de anexar (caso o ref já exista)
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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
        setCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
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
          setCameraActive(true);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
          }
        } catch (fallbackErr: any) {
          console.error("Falha final na câmera:", fallbackErr);
          setCameraActive(false);

          const errorName = fallbackErr.name || "UnknownError";
          const errorMessage = fallbackErr.message || "";

          if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
            const isAndroid = /Android/i.test(navigator.userAgent);
            setCameraError(`Permissão negada (${errorName}). ${isAndroid ? 'Toque nos três pontos (menu) > Configurações > Configurações do site > Câmera e permita o acesso.' : 'Toque no cadeado na barra de endereços para permitir a câmera.'}`);
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

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const newTorchState = !torchActive;
        await track.applyConstraints({
          advanced: [{ torch: newTorchState } as any]
        });
        setTorchActive(newTorchState);
        triggerHaptic('light');
      } catch (err) {
        console.warn("Erro ao controlar lanterna:", err);
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
      {needsPermission && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-black pointer-events-none" />
          <div className="w-32 h-32 bg-blue-600/20 rounded-full flex items-center justify-center mb-10 border border-blue-500/30 animate-premium-pulse">
            <svg className="w-16 h-16 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-4">Lupa Saúde</h1>
          <div className="bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-6 inline-block">
            Versão Android Otimizada
          </div>
          {cameraError ? (
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-8 max-w-xs mx-auto">
              <p className="text-red-400 text-sm font-bold">{cameraError}</p>
            </div>
          ) : (
            <p className="text-zinc-400 text-lg mb-12 max-w-xs leading-tight mx-auto">Para começar a ler suas receitas, precisamos de acesso à sua câmera.</p>
          )}
          <button
            onClick={() => startCamera()}
            className="w-full max-w-xs bg-white text-black py-6 rounded-[2rem] font-black text-xl uppercase tracking-widest active:scale-95 transition-all shadow-2xl"
          >
            {cameraError ? 'Tentar Novamente' : 'Iniciar Aplicativo'}
          </button>
          <p className="mt-8 text-zinc-600 text-[10px] uppercase font-bold tracking-widest">Tecnologia Acessível · São Paulo, BR</p>
        </div>
      )}
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

        {/* HUD de Scan e Controles Hardware */}
        {!isFrozen && (
          <>
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-white/20 rounded-[3rem] animate-premium-pulse flex items-center justify-center">
                  <div className="w-full h-1 bg-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.5)] absolute animate-bounce" />
                </div>
              </div>
            )}

            {/* Controles Laterais Premium */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 z-30">
              {hasTorch && (
                <button
                  onClick={toggleTorch}
                  className={`p-4 rounded-2xl glass transition-all active:scale-90 ${torchActive ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' : 'text-white'}`}
                >
                  <svg className="w-6 h-6" fill={torchActive ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0012 18.75c-1.03 0-1.9-.4-2.593-1.003l-.547-.547z" />
                  </svg>
                </button>
              )}

              <div className="flex flex-col items-center gap-3">
                <div className="bg-black/40 backdrop-blur-xl px-3 py-1.5 rounded-full text-[10px] font-black text-blue-400 border border-white/10 uppercase tracking-widest">
                  {settings.zoomLevel.toFixed(1)}x
                </div>
                <div className="h-48 w-12 glass rounded-full relative flex items-center justify-center">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.1"
                    value={settings.zoomLevel}
                    onChange={(e) => setSettings(s => ({ ...s, zoomLevel: parseFloat(e.target.value) }))}
                    style={{ appearance: 'none', width: '180px', height: '40px', transform: 'rotate(-90deg)', background: 'transparent', cursor: 'pointer' }}
                    className="absolute"
                  />
                </div>
              </div>

              <button onClick={() => setSettings(s => ({ ...s, zoomLevel: 1 }))} className="p-4 glass rounded-full active:scale-90 transition-transform">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5" /></svg>
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
