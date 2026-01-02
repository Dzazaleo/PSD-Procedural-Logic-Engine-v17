import React, { memo, useEffect, useState, useMemo, useRef } from 'react';
import { Handle, Position, NodeProps, useEdges, NodeResizer } from 'reactflow';
import { PSDNodeData, TransformedPayload } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { compositePayloadToCanvas } from '../services/psdService';
import { Eye, Layers, Maximize, Scan, AlertTriangle, RotateCw, ShieldCheck, FileWarning } from 'lucide-react';

export const ContainerPreviewNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track current payload to prevent redundant renders
  const lastPayloadRef = useRef<string | null>(null);

  const edges = useEdges();
  const { 
    payloadRegistry, 
    reviewerRegistry, 
    psdRegistry, 
    registerPreviewPayload,
    unregisterNode,
    globalVersion,
    triggerGlobalRefresh
  } = useProceduralStore();

  useEffect(() => {
    return () => unregisterNode(id);
  }, [id, unregisterNode]);

  // 1. Resolve Incoming Payload
  const incomingPayload = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'payload-in');
    if (!edge) return null;

    const reviewerData = reviewerRegistry[edge.source];
    if (reviewerData && reviewerData[edge.sourceHandle || '']) {
        return reviewerData[edge.sourceHandle || ''];
    }

    const rawData = payloadRegistry[edge.source];
    if (rawData && rawData[edge.sourceHandle || '']) {
        return rawData[edge.sourceHandle || ''];
    }

    return null;
  }, [edges, id, payloadRegistry, reviewerRegistry]);

  // 2. Render Effect
  useEffect(() => {
    if (!incomingPayload) {
        setPreviewUrl(null);
        setError(null);
        return;
    }

    const psd = psdRegistry[incomingPayload.sourceNodeId];
    
    // BINARY DETECTION LOGIC
    if (!psd) {
        setError('BINARY_MISSING');
        setIsLoading(false);
        registerPreviewPayload(id, 'payload-out', incomingPayload, '');
        return;
    }

    if (error === 'BINARY_MISSING') {
        setError(null);
    }

    const payloadSignature = JSON.stringify({
        metrics: incomingPayload.metrics,
        layers: incomingPayload.layers,
        id: incomingPayload.generationId,
        gv: globalVersion
    });

    if (lastPayloadRef.current === payloadSignature && !error && previewUrl) {
        return; 
    }
    lastPayloadRef.current = payloadSignature;

    setIsLoading(true);

    let isMounted = true;

    compositePayloadToCanvas(incomingPayload, psd)
        .then((url) => {
            if (isMounted && url) {
                setPreviewUrl(url);
                setIsLoading(false);
                setError(null);
                registerPreviewPayload(id, 'payload-out', incomingPayload, url);
            }
        })
        .catch(err => {
            console.error("Preview Render Failed:", err);
            if (isMounted) {
                setError('RENDER_FAILED');
                setIsLoading(false);
                registerPreviewPayload(id, 'payload-out', incomingPayload, '');
            }
        });

    return () => { isMounted = false; };

  }, [incomingPayload, psdRegistry, id, registerPreviewPayload, globalVersion]);

  const getLayerCount = (payload: TransformedPayload) => {
      let count = 0;
      const traverse = (layers: any[]) => {
          layers.forEach(l => {
              count++;
              if (l.children) traverse(l.children);
          });
      };
      traverse(payload.layers);
      return count;
  };

  const layerCount = incomingPayload ? getLayerCount(incomingPayload) : 0;
  const isPolished = incomingPayload?.isPolished;

  return (
    <div className={`min-w-[300px] min-h-[300px] bg-slate-900 rounded-lg shadow-2xl border font-sans flex flex-col overflow-hidden transition-all group duration-500
        ${error === 'BINARY_MISSING' 
            ? 'border-orange-500/50 shadow-orange-900/20' 
            : 'border-emerald-500/50 shadow-emerald-900/20 hover:border-emerald-400'
        }`}
    >
      <NodeResizer minWidth={300} minHeight={300} isVisible={false} />

      {/* Header - High Fidelity with Noise */}
      <div className={`relative p-2 border-b flex items-center justify-between shrink-0 overflow-hidden backdrop-blur-md
          ${error === 'BINARY_MISSING' 
              ? 'bg-orange-950/90 border-orange-500/30' 
              : 'bg-emerald-950/90 border-emerald-500/30'
          }`}
      >
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light pointer-events-none"></div>
         
         <div className="flex items-center space-x-2 z-10">
           <Eye className={`w-4 h-4 ${error === 'BINARY_MISSING' ? 'text-orange-400' : 'text-emerald-400'}`} />
           <div className="flex flex-col leading-none">
             <span className={`text-sm font-bold tracking-tight ${error === 'BINARY_MISSING' ? 'text-orange-100' : 'text-emerald-100'}`}>Visual Preview</span>
             <span className={`text-[9px] font-mono font-bold tracking-widest ${error === 'BINARY_MISSING' ? 'text-orange-500/70' : 'text-emerald-500/70'}`}>RENDER ENGINE</span>
           </div>
         </div>
         <div className="z-10 flex space-x-2">
             {isPolished && (
                 <span className="flex items-center gap-1 text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold uppercase tracking-widest backdrop-blur-sm">
                     <ShieldCheck className="w-2.5 h-2.5" /> Polished
                 </span>
             )}
         </div>
      </div>

      {/* Input Handles Area - Darker, cleaner */}
      <div className="relative h-10 bg-slate-950 border-b border-slate-800 flex items-center px-2 justify-between">
          {/* Docked Handles */}
          <Handle type="target" position={Position.Left} id="payload-in" 
              className="!absolute !-left-1.5 !top-2.5 !w-3 !h-3 !rounded-full !bg-indigo-500 !border-2 !border-slate-900 z-50" 
              title="Input: Transformed Payload" 
          />
          <Handle type="target" position={Position.Left} id="target-in" 
              className="!absolute !-left-1.5 !top-7 !w-3 !h-3 !rounded-full !bg-emerald-500 !border-2 !border-slate-900 z-50" 
              title="Input: Target Definition" 
          />

          <div className="flex items-center gap-4 pl-3">
              <div className="flex items-center">
                  <span className="text-[9px] text-slate-500 font-mono ml-1.5 font-bold tracking-wider">PAYLOAD</span>
              </div>
              <div className="flex items-center">
                  <span className="text-[9px] text-slate-500 font-mono ml-1.5 font-bold tracking-wider">TARGET</span>
              </div>
          </div>
          {incomingPayload && (
              <span className="text-[9px] text-slate-400 font-mono font-medium">
                  {incomingPayload.targetContainer}
              </span>
          )}
      </div>

      {/* Main Preview Stage - Monitor Frame */}
      <div className="flex-1 bg-[#0f172a] relative overflow-hidden flex items-center justify-center p-3">
          {/* Inner Bezel/Frame */}
          <div className={`relative w-full h-full rounded border-2 overflow-hidden flex items-center justify-center transition-colors duration-500
             ${error === 'BINARY_MISSING' ? 'border-orange-900/50 bg-orange-950/10' : 'border-emerald-900/50 bg-slate-900/50 shadow-inner'}
          `}>
              {/* Checkerboard Background */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" 
                   style={{ backgroundImage: `url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6WCgAgCT0kt0eZxtwgAAAABJRU5ErkJggg==')` }}>
              </div>

              {/* Empty State */}
              {!incomingPayload && (
                  <div className="flex flex-col items-center text-slate-600 z-10">
                      <Scan className="w-8 h-8 mb-2 opacity-30" />
                      <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Awaiting Signal</span>
                  </div>
              )}

              {/* Binary Missing Error - REHYDRATION STATE */}
              {error === 'BINARY_MISSING' && (
                  <div className="absolute inset-0 bg-orange-950/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-4 text-center">
                      <FileWarning className="w-8 h-8 text-orange-500 mb-2 animate-bounce" />
                      <span className="text-xs font-bold text-orange-200 uppercase tracking-wider mb-1">Binary Source Missing</span>
                      <span className="text-[10px] text-orange-200/80 leading-tight mb-3 px-2 max-w-[200px]">
                          Re-upload source PSD to enable visual compositing.
                      </span>
                      
                      <button 
                        onClick={() => triggerGlobalRefresh()}
                        className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-lg border border-orange-400/50"
                      >
                          <RotateCw className="w-3 h-3" />
                          Refresh
                      </button>
                  </div>
              )}
              
              {/* Generic Render Error */}
              {error === 'RENDER_FAILED' && (
                  <div className="absolute inset-0 bg-red-950/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-4 text-center">
                      <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                      <span className="text-xs font-bold text-red-200 uppercase tracking-wider mb-1">Render Failed</span>
                      <span className="text-[10px] text-red-200/80 leading-tight">
                          Compositor error. Data passed through.
                      </span>
                  </div>
              )}

              {/* Content Render */}
              {previewUrl && !isLoading && !error && (
                  <img 
                    src={previewUrl} 
                    alt="Container Preview" 
                    className="w-full h-full object-contain relative z-10 drop-shadow-2xl"
                  />
              )}

              {/* Scanning Overlay - Enhanced */}
              {isLoading && (
                  <div className="absolute inset-0 z-30 pointer-events-none">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent animate-scan-y"></div>
                      <div className="absolute inset-x-0 h-px bg-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.8)] animate-scan-line"></div>
                      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-slate-900/90 px-2 py-1 rounded border border-emerald-500/30 shadow-xl backdrop-blur-md">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                          <span className="text-[9px] text-emerald-300 font-mono font-bold tracking-wider">RENDERING</span>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* Footer */}
      <div className="h-8 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-3 shrink-0 text-[9px] font-mono font-bold tracking-wider text-slate-500">
          <div className="flex items-center gap-3">
              {incomingPayload && (
                  <>
                    <div className="flex items-center gap-1.5">
                        <Layers className="w-3 h-3 opacity-70" />
                        <span>{layerCount} NODES</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Maximize className="w-3 h-3 opacity-70" />
                        <span>{incomingPayload.scaleFactor.toFixed(2)}x SCALE</span>
                    </div>
                  </>
              )}
          </div>
          
          <div className="relative flex items-center">
              <span className="text-[8px] font-bold text-emerald-700 mr-4 tracking-widest uppercase">Proxy Out</span>
              <Handle type="source" position={Position.Right} id="payload-out" className="!static !w-2.5 !h-2.5 !rounded-full !bg-emerald-500 !border-2 !border-slate-800 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Output: Validated Payload" />
          </div>
      </div>

      <style>{`
        @keyframes scan-y {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
        }
        .animate-scan-y {
            animation: scan-y 2s linear infinite;
        }
        @keyframes scan-line {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .animate-scan-line {
            animation: scan-line 2s linear infinite;
        }
      `}</style>
    </div>
  );
});