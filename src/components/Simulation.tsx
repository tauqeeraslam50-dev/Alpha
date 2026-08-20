import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Share2, Play, Activity, Wifi, MapPin } from 'lucide-react';
import { calculatePathLossAtDistance, calculateRadioHorizon } from '../lib/utils';
import * as d3 from 'd3';

// Helper to determine if a link is physically possible
function checkLinkViability(link: any, equipmentDB: any[]): { isViable: boolean, margin: number } {
  // Assume default tower heights of 30m
  const pathLoss = calculatePathLossAtDistance(link.distanceKm, link.frequencyMHz, 30, 30, 'los');
  const rxSens = equipmentDB.find((e: any) => e.id === link.equipmentId)?.rxSensitivityDBm || -110;
  const prx = link.txPowerDBm + link.txAntennaGainDBi + link.rxAntennaGainDBi - link.txCableLossDB - link.rxCableLossDB - pathLoss;
  const margin = prx - rxSens;
  return { isViable: margin >= 0, margin };
}

// Dijkstra's algorithm for shortest path
function findShortestPath(nodes: any[], links: any[], sourceId: string, targetId: string, equipmentDB: any[]) {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set(nodes.map(n => n.id));

  nodes.forEach(n => {
    distances[n.id] = Infinity;
    previous[n.id] = null;
  });
  distances[sourceId] = 0;

  while (unvisited.size > 0) {
    let closestNode = null;
    let minDistance = Infinity;

    unvisited.forEach(id => {
      if (distances[id] < minDistance) {
        minDistance = distances[id];
        closestNode = id;
      }
    });

    if (closestNode === null || closestNode === targetId) break;

    unvisited.delete(closestNode);

    const neighbors = links.filter(l => l.sourceSiteId === closestNode || l.targetSiteId === closestNode);
    neighbors.forEach(link => {
      // ONLY traverse physically viable links
      if (!checkLinkViability(link, equipmentDB).isViable) return;

      // Treat distance as the weight
      const neighborId = link.sourceSiteId === closestNode ? link.targetSiteId : link.sourceSiteId;
      if (unvisited.has(neighborId)) {
        const alt = distances[closestNode!] + link.distanceKm;
        if (alt < distances[neighborId]) {
          distances[neighborId] = alt;
          previous[neighborId] = closestNode;
        }
      }
    });
  }

  const path = [];
  let curr = targetId;
  while (curr !== null) {
    path.unshift(curr);
    curr = previous[curr] as any;
  }
  
  if (path.length > 0 && path[0] === sourceId) {
    return path;
  }
  return null;
}

export function Simulation() {
  const { sites, links, equipmentDB } = useAppContext();
  const svgRef = useRef<SVGSVGElement>(null);
  
  const [sourceNode, setSourceNode] = useState<string>(sites.length > 0 ? sites[0].id : '');
  const [targetNode, setTargetNode] = useState<string>(sites.length > 1 ? sites[1].id : '');
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [simState, setSimState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [logs, setLogs] = useState<{time: string, msg: string, type: 'info'|'success'|'error'}[]>([]);

  useEffect(() => {
    if (!svgRef.current || sites.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Prepare data
    const nodes = sites.map(s => ({ ...s }));
    const edges = links.map(l => ({
      source: l.sourceSiteId,
      target: l.targetSiteId,
      ...l
    }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(40));

    // Draw links
    const linkGroup = svg.append("g")
      .selectAll("g")
      .data(edges)
      .enter().append("g");

    const link = linkGroup.append("line")
      .attr("stroke", (d: any) => {
        // Highlight active path edges
        if (activePath) {
          for (let i = 0; i < activePath.length - 1; i++) {
            if ((d.sourceSiteId === activePath[i] && d.targetSiteId === activePath[i+1]) ||
                (d.sourceSiteId === activePath[i+1] && d.targetSiteId === activePath[i])) {
              return "#3b82f6"; // Blue active path
            }
          }
        }
        const { isViable } = checkLinkViability(d, equipmentDB);
        return isViable ? "#cbd5e1" : "#ef4444"; // Grey if viable, Red if unviable (blocked by earth or loss)
      })
      .attr("stroke-width", (d: any) => {
        if (activePath) {
          for (let i = 0; i < activePath.length - 1; i++) {
            if ((d.sourceSiteId === activePath[i] && d.targetSiteId === activePath[i+1]) ||
                (d.sourceSiteId === activePath[i+1] && d.targetSiteId === activePath[i])) {
              return 4;
            }
          }
        }
        const { isViable } = checkLinkViability(d, equipmentDB);
        // Slightly thicker for failed links if running to make dots visible
        if (!isViable && simState !== 'idle') return 3;
        return 2;
      })
      .attr("stroke-linecap", (d: any) => {
        const { isViable } = checkLinkViability(d, equipmentDB);
        return (!isViable && simState !== 'idle') ? "round" : "butt";
      })
      .attr("stroke-dasharray", (d: any) => {
        const { isViable, margin } = checkLinkViability(d, equipmentDB);
        if (!isViable && simState !== 'idle') return "0, 8"; // Red dots
        if (!isViable || margin < 10) return "5,5";
        return "none";
      });

    // Add Green Animated Signal Icon for Viable Links when running
    if (simState !== 'idle') {
      const viableIcons = linkGroup.filter((d: any) => checkLinkViability(d, equipmentDB).isViable)
        .append("g")
        .attr("class", "signal-icon");
        
      viableIcons.append("circle")
        .attr("r", 5)
        .attr("fill", "none")
        .attr("stroke", "#10b981") // Green
        .attr("stroke-width", 2)
        .html(`
          <animate attributeName="r" values="2; 12; 2" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1; 0; 1" dur="1.5s" repeatCount="indefinite" />
        `);

      viableIcons.append("circle")
        .attr("r", 3)
        .attr("fill", "#10b981");
    }

    // Draw nodes
    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .call(d3.drag<SVGGElement, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("circle")
      .attr("r", 15)
      .attr("fill", (d: any) => {
        if (d.type === 'base-station') return "#2563eb";
        if (d.type === 'repeater') return "#eab308";
        return "#94a3b8";
      })
      .attr("stroke", (d: any) => {
        if (activePath && activePath.includes(d.id)) return "#10b981";
        return "#ffffff";
      })
      .attr("stroke-width", (d: any) => activePath && activePath.includes(d.id) ? 3 : 2)
      .style("filter", "drop-shadow(0 2px 3px rgba(0,0,0,0.2))");

    node.append("text")
      .text((d: any) => d.name)
      .attr("x", 20)
      .attr("y", 5)
      .attr("font-size", "10px")
      .attr("font-family", "monospace")
      .attr("font-weight", "bold")
      .attr("fill", "#475569");

    // Add pulsing effect for source and target
    node.filter((d: any) => d.id === sourceNode || d.id === targetNode)
      .append("circle")
      .attr("r", 15)
      .attr("fill", "none")
      .attr("stroke", (d: any) => d.id === sourceNode ? "#f59e0b" : "#ec4899")
      .attr("stroke-width", 2)
      .html(`
        <animate attributeName="r" values="15; 25; 15" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1; 0; 1" dur="2s" repeatCount="indefinite" />
      `);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
        
      linkGroup.selectAll(".signal-icon")
        .attr("transform", (d: any) => `translate(${(d.source.x + d.target.x) / 2}, ${(d.source.y + d.target.y) / 2})`);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [sites, links, sourceNode, targetNode, activePath]);

  const addLog = (msg: string, type: 'info'|'success'|'error') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  const runSimulation = () => {
    setSimState('running');
    setActivePath(null);
    setLogs([]);
    addLog(`Initiating trace from ${sites.find(s=>s.id===sourceNode)?.name} to ${sites.find(s=>s.id===targetNode)?.name}...`, 'info');

    setTimeout(() => {
      const path = findShortestPath(sites, links, sourceNode, targetNode, equipmentDB);
      if (path) {
        addLog(`Path found! Hops required: ${path.length - 1}`, 'success');
        
        // Analyze hops
        let totalDistance = 0;
        let minFadeMargin = Infinity;
        let valid = true;

        for (let i = 0; i < path.length - 1; i++) {
          const sId = path[i];
          const tId = path[i+1];
          const l = links.find(l => (l.sourceSiteId === sId && l.targetSiteId === tId) || (l.sourceSiteId === tId && l.targetSiteId === sId));
          if (l) {
            totalDistance += l.distanceKm;
            const { isViable, margin } = checkLinkViability(l, equipmentDB);
            if (margin < minFadeMargin) minFadeMargin = margin;
            if (!isViable) {
              valid = false;
              addLog(`Hop ${i+1} failed: Path is physically unviable (Margin ${margin.toFixed(1)}dB).`, 'error');
            } else {
              addLog(`Hop ${i+1}: Margin ${l.fadeMarginDB}dB (Distance: ${l.distanceKm.toFixed(1)}km)`, 'info');
            }
          }
        }

        setTimeout(() => {
          if (valid) {
            addLog(`Trace successful! Total distance: ${totalDistance.toFixed(1)}km, Bottleneck Margin: ${minFadeMargin}dB.`, 'success');
            setActivePath(path);
            setSimState('done');
          } else {
            addLog(`Trace failed due to unviable links in path.`, 'error');
            setActivePath(path);
            setSimState('failed');
          }
        }, 1000);

      } else {
        addLog(`Destination unreachable. No network path exists.`, 'error');
        setSimState('failed');
      }
    }, 1000);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <Share2 className="w-6 h-6 mr-3 text-blue-600" />
            Network Topology & Simulation
          </h2>
          <p className="text-sm text-slate-500 mt-1">Visualize force-directed topology and simulate end-to-end signal tracing.</p>
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Left Column: Graph */}
        <div className="flex-1 bg-white border border-slate-300 shadow-sm rounded-xl p-4 flex flex-col relative overflow-hidden">
          <div className="absolute top-4 left-4 z-10 flex gap-4">
            <div className="flex items-center text-xs font-semibold text-slate-600 bg-white/80 p-2 rounded border border-slate-200">
              <div className="w-3 h-3 rounded-full bg-blue-600 mr-2 shadow-sm"></div>Base Station
            </div>
            <div className="flex items-center text-xs font-semibold text-slate-600 bg-white/80 p-2 rounded border border-slate-200">
              <div className="w-3 h-3 rounded bg-indigo-500 mr-2 shadow-sm"></div>Repeater
            </div>
            {activePath && (
              <div className="flex items-center text-xs font-semibold text-slate-600 bg-white/80 p-2 rounded border border-slate-200">
                <div className="w-3 h-1 bg-blue-500 mr-2 shadow-sm"></div>Active Trace
              </div>
            )}
          </div>
          <svg ref={svgRef} className="w-full h-full bg-slate-50 rounded-lg cursor-move"></svg>
        </div>

        {/* Right Column: Controls & Logs */}
        <div className="w-80 flex flex-col gap-6">
          <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2 flex items-center">
              <Activity className="w-4 h-4 mr-2" /> Trace Route
            </h3>
            
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Source Node</label>
                <select 
                  value={sourceNode} 
                  onChange={e => setSourceNode(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                >
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Destination Node</label>
                <select 
                  value={targetNode} 
                  onChange={e => setTargetNode(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                >
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <button 
              onClick={runSimulation}
              disabled={simState === 'running' || sourceNode === targetNode}
              className="w-full flex justify-center items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-bold rounded shadow-sm transition"
            >
              {simState === 'running' ? (
                <span className="animate-pulse flex items-center"><Activity className="w-4 h-4 mr-2" /> Simulating...</span>
              ) : (
                <span className="flex items-center"><Play className="w-4 h-4 mr-2" /> Start Trace</span>
              )}
            </button>
          </div>

          <div className="flex-1 bg-slate-900 border border-slate-800 shadow-sm rounded-xl p-4 flex flex-col overflow-hidden">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-700 pb-2 flex items-center">
              <Wifi className="w-3 h-3 mr-2" /> Simulation Telemetry
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center mt-10">Awaiting simulation start...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-500 flex-shrink-0">[{log.time}]</span>
                    <span className={
                      log.type === 'error' ? 'text-rose-400 font-semibold' :
                      log.type === 'success' ? 'text-emerald-400 font-semibold' :
                      'text-slate-300'
                    }>
                      {log.msg}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
