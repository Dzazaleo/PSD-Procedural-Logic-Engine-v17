import React, { memo, useEffect, useState, useMemo, useRef } from 'react';
import { Handle, Position, NodeProps, useEdges, NodeResizer } from 'reactflow';
import { PSDNodeData, TransformedPayload } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { compositePayloadToCanvas } from '../services/psdService';
import { Eye, Layers, Maximize, Scan, AlertTriangle, CheckCircle2, FileWarning, ShieldCheck, RotateCw } from 'lucide-react';

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
  // Look for a connected source on 'payload-in'
  // Priority: Reviewer Registry (Polished) -> Payload Registry (Raw)
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

  // 2. Render Effect (Triggered by Payload OR Global Version/Rehydration)
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
        // CRITICAL: Relay payload even if visual is missing to maintain data flow to Export
        // We pass an empty string for the URL to indicate "no visual available" but data is valid.
        registerPreviewPayload(id, 'payload-out', incomingPayload, '');
        return;
    }

    // Reset error if we recovered
    if (error === 'BINARY_MISSING') {
        setError(null);
    }

    // Optimization: Check deep equality using JSON string + Global Version
    // We include globalVersion in the signature to force re-renders if the store signals a refresh
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

    // Start Render
    setIsLoading(true);

    let isMounted = true;

    compositePayloadToCanvas(incomingPayload, psd)
        .then((url) => {
            if (isMounted && url) {
                setPreviewUrl(url);
                setIsLoading(false);
                setError(null);
                
                // 3. Broadcast to Store (Proxy Logic)
                // This validates the node as a 'Polished' source for Export with a valid visual
                registerPreviewPayload(id, 'payload-out', incomingPayload, url);
            }
        })
        .catch(err => {
            console.error("Preview Render Failed:", err);
            if (isMounted) {
                setError('RENDER_FAILED');
                setIsLoading(false);
                // Pipeline Safety: Still relay the data even if rendering fails
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
    <div className={`min-w-[300px] min-h-[300px] bg-slate-900 rounded-lg shadow-2xl border font-sans flex flex-col overflow-hidden transition-all group ${error === 'BINARY_MISSING' ? 'border-orange-500/50 hover:border-orange-400' : 'border-emerald-500/50 hover:border-emerald-400'}`}>
      <NodeResizer minWidth={300} minHeight={300} isVisible={true} lineStyle={{ border: 'none' }} handleStyle={{ background: 'transparent' }} />

      {/* Header */}
      <div className={`p-2 border-b flex items-center justify-between shrink-0 relative overflow-hidden ${error === 'BINARY_MISSING' ? 'bg-orange-950/80 border-orange-500/30' : 'bg-emerald-950/80 border-emerald-500/30'}`}>
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
         <div className="flex items-center space-x-2 z-10">
           <Eye className={`w-4 h-4 ${error === 'BINARY_MISSING' ? 'text-orange-400' : 'text-emerald-400'}`} />
           <div className="flex flex-col leading-none">
             <span className={`text-sm font-bold tracking-tight ${error === 'BINARY_MISSING' ? 'text-orange-100' : 'text-emerald-100'}`}>Visual Preview</span>
             <span className={`text-[9px] font-mono ${error === 'BINARY_MISSING' ? 'text-orange-500/70' : 'text-emerald-500/70'}`}>RENDER ENGINE</span>
           </div>
         </div>
         <div className="z-10 flex space-x-2">
             {isPolished && (
                 <span className="flex items-center gap-1 text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold uppercase tracking-wider">
                     <ShieldCheck className="w-2.5 h-2.5" /> Polished
                 </span>
             )}
         </div>
      </div>

      {/* Input Handles Area */}
      <div className="relative h-8 bg-slate-900 border-b border-slate-800 flex items-center px-2 justify-between">
          <div className="flex items-center gap-4">
              <div className="relative flex items-center">
                  <Handle type="target" position={Position.Left} id="payload-in" className="!static !w-2.5 !h-2.5 !bg-indigo-500 !border-slate-800" title="Input: Transformed Payload" />
                  <span className="text-[9px] text-slate-500 font-mono ml-1.5 font-bold">PAYLOAD</span>
              </div>
              <div className="relative flex items-center">
                  <Handle type="target" position={Position.Left} id="target-in" className="!static !w-2.5 !h-2.5 !bg-emerald-500 !border-slate-800" title="Input: Target Definition" />
                  <span className="text-[9px] text-slate-500 font-mono ml-1.5 font-bold">TARGET</span>
              </div>
          </div>
          {incomingPayload && (
              <span className="text-[9px] text-slate-400 font-mono">
                  {incomingPayload.targetContainer}
              </span>
          )}
      </div>

      {/* Main Preview Stage */}
      <div className="flex-1 bg-[#1e293b] relative overflow-hidden flex items-center justify-center p-2">
          {/* Checkerboard Background */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" 
               style={{ backgroundImage: `url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6WCgAgCT0kt0eZxtwgAAAABJRU5ErkJggg==')` }}>
          </div>

          {/* Empty State */}
          {!incomingPayload && (
              <div className="flex flex-col items-center text-slate-600 z-10">
                  <Scan className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-xs font-medium">Waiting for signal...</span>
              </div>
          )}

          {/* Binary Missing Error - REHYDRATION STATE */}
          {error === 'BINARY_MISSING' && (
              <div className="absolute inset-0 bg-orange-950/40 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-4 text-center border-2 border-orange-500/30 m-2 rounded">
                  <FileWarning className="w-8 h-8 text-orange-500 mb-2 animate-bounce" />
                  <span className="text-xs font-bold text-orange-200 uppercase tracking-wider mb-1">Binary Source Missing</span>
                  <span className="text-[10px] text-orange-200/80 leading-tight mb-3 px-2">
                      Please re-upload the source PSD in the Load Node to enable preview.
                  </span>
                  
                  <button 
                    onClick={() => triggerGlobalRefresh()}
                    className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-lg"
                  >
                      <RotateCw className="w-3 h-3" />
                      Refresh
                  </button>
              </div>
          )}
          
          {/* Generic Render Error */}
          {error === 'RENDER_FAILED' && (
              <div className="absolute inset-0 bg-red-950/40 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-4 text-center border-2 border-red-500/30 m-2 rounded">
                  <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                  <span className="text-xs font-bold text-red-200 uppercase tracking-wider mb-1">Render Failed</span>
                  <span className="text-[10px] text-red-200/80 leading-tight">
                      The compositor encountered an error. Data has been passed through.
                  </span>
              </div>
          )}

          {/* Content Render */}
          {previewUrl && !isLoading && !error && (
              <img 
                src={previewUrl} 
                alt="Container Preview" 
                className="w-full h-full object-contain relative z-10"
              />
          )}

          {/* Loading Overlay */}
          {isLoading && (
              <div className="absolute inset-0 bg-slate-900/50 z-30 flex items-center justify-center">
                  <div className="relative w-full h-full overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent animate-scan-y"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-slate-900/90 px-3 py-1.5 rounded border border-emerald-500/30 flex items-center gap-2 shadow-xl">
                              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                              <span className="text-[10px] text-emerald-300 font-mono uppercase tracking-wider">Rendering...</span>
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* Footer / Metrics */}
      <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-3">
              {incomingPayload && (
                  <>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                        <Layers className="w-3 h-3" />
                        <span>{layerCount} Nodes</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                        <Maximize className="w-3 h-3" />
                        <span className="font-mono">{incomingPayload.scaleFactor.toFixed(2)}x</span>
                    </div>
                  </>
              )}
          </div>
          
          <div className="relative flex items-center">
              <span className="text-[9px] font-bold text-emerald-600 mr-4 tracking-widest uppercase">Proxy Out</span>
              <Handle type="source" position={Position.Right} id="payload-out" className="!static !w-2.5 !h-2.5 !bg-emerald-500 !border-slate-800" title="Output: Validated Payload" />
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
      `}</style>
    </div>
  );
});