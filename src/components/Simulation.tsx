import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  Share2, Play, Square, Activity, Wifi, AlertTriangle, CheckCircle2, 
  XCircle, RotateCcw, Radio, Zap, ShieldAlert, Gauge, Terminal, 
  Layers, Download, RefreshCw, ArrowRight, ArrowLeftRight, Volume2, 
  VolumeX, Server, Satellite, Cpu, Signal
} from 'lucide-react';
import { calculatePathLossAtDistance } from '../lib/utils';
import { analyzeLOS } from '../lib/losUtils';
import * as d3 from 'd3';

// Helper to determine if an RF link is physically viable
function checkLinkViability(link: any, sites: any[], equipmentDB: any[]): { 
  isViable: boolean; 
  margin: number; 
  pathLoss: number; 
  delayMs: number;
  isLosBlocked: boolean;
  worstObstacleM?: number;
} {
  const source = sites.find(s => s.id === link.sourceSiteId);
  const target = sites.find(s => s.id === link.targetSiteId);

  const txTower = source?.antennaHeightM || 25;
  const rxTower = target?.antennaHeightM || 25;
  const freq = link.frequencyMHz || 400;

  // Real DEM Line of Sight clearance check
  let isLosBlocked = false;
  let worstObstacleM = 0;
  if (source && target && !isNaN(source.lat) && !isNaN(target.lat)) {
    const los = analyzeLOS({
      txLat: source.lat,
      txLng: source.lng,
      rxLat: target.lat,
      rxLng: target.lng,
      txElevationM: source.elevation,
      rxElevationM: target.elevation,
      txTowerHeightM: txTower,
      rxTowerHeightM: rxTower,
      frequencyMHz: freq,
      samplePointsCount: 15,
    });
    if (los.status === 'OBSTRUCTED' || (los.worstPoint && los.worstPoint.clearanceM < 0)) {
      isLosBlocked = true;
      worstObstacleM = Math.abs(los.worstPoint?.clearanceM || 0);
    }
  }

  const pathLoss = calculatePathLossAtDistance(link.distanceKm, freq, txTower, rxTower, isLosBlocked ? 'nlos' : 'los');
  const rxSens = equipmentDB.find((e: any) => e.id === link.equipmentId)?.rxSensitivityDBm || -110;
  const txPwr = link.txPowerDBm || 47; // 50W default
  const txGain = link.txAntennaGainDBi || 6;
  const rxGain = link.rxAntennaGainDBi || 6;
  const prx = txPwr + txGain + rxGain - (link.txCableLossDB || 1.5) - (link.rxCableLossDB || 1.5) - pathLoss;
  const margin = prx - rxSens;

  // Propagation delay: speed of light ~3.33 microseconds per km + 1.2ms hardware DSP processing
  const delayMs = (link.distanceKm * 0.00333) + 1.2;

  const isViable = !isLosBlocked && margin >= 3.0; // Require 3dB minimum operating margin
  return { isViable, margin, pathLoss, delayMs, isLosBlocked, worstObstacleM };
}

// Dijkstra's algorithm for shortest viable path routing with failed nodes excluded
function findShortestViablePath(
  nodes: any[], 
  links: any[], 
  sourceId: string, 
  targetId: string, 
  equipmentDB: any[],
  failedNodeIds: Set<string>
) {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set(nodes.map(n => n.id).filter(id => !failedNodeIds.has(id)));

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
      const neighborId = link.sourceSiteId === closestNode ? link.targetSiteId : link.sourceSiteId;
      if (failedNodeIds.has(neighborId)) return;

      // Check physical RF viability
      const viability = checkLinkViability(link, nodes, equipmentDB);
      if (!viability.isViable) return;

      if (unvisited.has(neighborId)) {
        // Metric: distance + latency penalty for low fade margin
        const costWeight = link.distanceKm + (viability.margin < 10 ? 15 : 0);
        const alt = distances[closestNode!] + costWeight;
        if (alt < distances[neighborId]) {
          distances[neighborId] = alt;
          previous[neighborId] = closestNode;
        }
      }
    });
  }

  const path = [];
  let curr: string | null = targetId;
  while (curr !== null) {
    path.unshift(curr);
    curr = previous[curr] || null;
  }
  
  if (path.length > 0 && path[0] === sourceId) {
    return path;
  }
  return null;
}

export function Simulation() {
  const { sites, links, equipmentDB } = useAppContext();
  const svgRef = useRef<SVGSVGElement>(null);
  const streamIntervalRef = useRef<any>(null);

  // Source / Destination selection
  const [sourceNode, setSourceNode] = useState<string>(() => sites[0]?.id || '');
  const [targetNode, setTargetNode] = useState<string>(() => (sites.length > 1 ? sites[1]?.id : sites[0]?.id || ''));
  
  // Simulation modes & state
  const [simMode, setSimMode] = useState<'trace' | 'stream' | 'failover'>('trace');
  const [simState, setSimState] = useState<'idle' | 'running' | 'streaming' | 'done' | 'failed'>('idle');
  const [packetRate, setPacketRate] = useState<number>(2); // pkts/sec
  const [payloadSize, setPayloadSize] = useState<number>(128); // bytes
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Active path and failed/disabled nodes for fault injection
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [failedNodeIds, setFailedNodeIds] = useState<Set<string>>(new Set());
  
  // Real-time telemetry counters
  const [packetsSent, setPacketsSent] = useState<number>(0);
  const [packetsReceived, setPacketsReceived] = useState<number>(0);
  const [packetsLost, setPacketsLost] = useState<number>(0);
  const [currentLatency, setCurrentLatency] = useState<number>(0);
  const [currentJitter, setCurrentJitter] = useState<number>(0);
  const [currentThroughputKbps, setCurrentThroughputKbps] = useState<number>(0);
  const [bottleneckSNR, setBottleneckSNR] = useState<number>(0);

  // Telemetry Console Logs
  const [logs, setLogs] = useState<{
    id: string;
    time: string;
    msg: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'packet';
    details?: string;
  }[]>([]);

  // Sound generator
  const playBeep = (freq = 880, duration = 0.06) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const addLog = (msg: string, type: 'info' | 'success' | 'warning' | 'error' | 'packet', details?: string) => {
    setLogs(prev => [
      { id: Math.random().toString(36).substring(2, 9), time: new Date().toLocaleTimeString(), msg, type, details },
      ...prev.slice(0, 99)
    ]);
  };

  // Toggle node outage
  const toggleNodeFailure = (nodeId: string) => {
    setFailedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        addLog(`Site ${sites.find(s => s.id === nodeId)?.name} restored to ONLINE status.`, 'info');
      } else {
        next.add(nodeId);
        addLog(`FAULT INJECTED: Site ${sites.find(s => s.id === nodeId)?.name} taken OFFLINE.`, 'warning');
      }
      return next;
    });
  };

  // Calculate detailed hop analysis for active path
  const pathHopsAnalysis = useMemo(() => {
    if (!activePath || activePath.length < 2) return [];
    const hops = [];
    for (let i = 0; i < activePath.length - 1; i++) {
      const sId = activePath[i];
      const tId = activePath[i + 1];
      const s = sites.find(site => site.id === sId);
      const t = sites.find(site => site.id === tId);
      const link = links.find(l => (l.sourceSiteId === sId && l.targetSiteId === tId) || (l.sourceSiteId === tId && l.targetSiteId === sId));
      if (s && t && link) {
        const viability = checkLinkViability(link, sites, equipmentDB);
        hops.push({
          hopIndex: i + 1,
          source: s,
          target: t,
          distanceKm: link.distanceKm,
          frequencyMHz: link.frequencyMHz || 400,
          marginDB: viability.margin,
          pathLossDB: viability.pathLoss,
          delayMs: viability.delayMs,
          isViable: viability.isViable,
          isBlocked: viability.isLosBlocked,
          worstObstacleM: viability.worstObstacleM,
        });
      }
    }
    return hops;
  }, [activePath, sites, links, equipmentDB]);

  // Execute Route Discovery / Trace
  const runRouteTrace = () => {
    if (!sourceNode || !targetNode || sourceNode === targetNode) return;
    setSimState('running');
    setActivePath(null);
    setLogs([]);
    addLog(`Initiating Tactical Route Discovery: [${sites.find(s => s.id === sourceNode)?.name}] ➔ [${sites.find(s => s.id === targetNode)?.name}]...`, 'info');

    setTimeout(() => {
      const path = findShortestViablePath(sites, links, sourceNode, targetNode, equipmentDB, failedNodeIds);
      if (path) {
        let totalDistance = 0;
        let totalDelay = 0;
        let minMargin = Infinity;

        for (let i = 0; i < path.length - 1; i++) {
          const l = links.find(link => (link.sourceSiteId === path[i] && link.targetSiteId === path[i + 1]) || (link.sourceSiteId === path[i + 1] && link.targetSiteId === path[i]));
          if (l) {
            totalDistance += l.distanceKm;
            const v = checkLinkViability(l, sites, equipmentDB);
            totalDelay += v.delayMs;
            if (v.margin < minMargin) minMargin = v.margin;
          }
        }

        setActivePath(path);
        setSimState('done');
        setCurrentLatency(totalDelay);
        setCurrentJitter(totalDelay * 0.12);
        setBottleneckSNR(minMargin);
        setCurrentThroughputKbps(payloadSize * 8 * packetRate);

        addLog(`Route Established! Hops: ${path.length - 1} | Total Distance: ${totalDistance.toFixed(1)} km | Latency: ${totalDelay.toFixed(1)} ms | Bottleneck SNR: ${minMargin.toFixed(1)} dB`, 'success');
        playBeep(1046, 0.12);
      } else {
        setSimState('failed');
        setActivePath(null);
        addLog(`Destination Unreachable: No physically viable RF path exists. Check node outages, terrain obstructions, or distance constraints.`, 'error');
        playBeep(330, 0.25);
      }
    }, 600);
  };

  // Continuous Packet Flow Stream
  useEffect(() => {
    if (simMode === 'stream' && simState === 'streaming') {
      const path = findShortestViablePath(sites, links, sourceNode, targetNode, equipmentDB, failedNodeIds);
      if (!path) {
        setSimState('failed');
        addLog(`Packet Stream Aborted: Path broken due to node/link outage.`, 'error');
        return;
      }
      setActivePath(path);

      let seq = packetsSent;
      const intervalMs = 1000 / packetRate;

      streamIntervalRef.current = setInterval(() => {
        seq++;
        setPacketsSent(s => s + 1);

        // Check if path is still viable
        const currentPath = findShortestViablePath(sites, links, sourceNode, targetNode, equipmentDB, failedNodeIds);
        if (!currentPath) {
          setPacketsLost(l => l + 1);
          addLog(`[SEQ #${seq}] Frame DROPPED: Link severed!`, 'error');
          playBeep(220, 0.05);
          return;
        }

        // Calculate dynamic jitter & packet delivery
        let hopDelay = 0;
        let minMargin = Infinity;
        for (let i = 0; i < currentPath.length - 1; i++) {
          const l = links.find(link => (link.sourceSiteId === currentPath[i] && link.targetSiteId === currentPath[i + 1]) || (link.sourceSiteId === currentPath[i + 1] && link.targetSiteId === currentPath[i]));
          if (l) {
            const v = checkLinkViability(l, sites, equipmentDB);
            hopDelay += v.delayMs;
            if (v.margin < minMargin) minMargin = v.margin;
          }
        }

        const jitter = (Math.random() - 0.5) * 1.8;
        const latency = Math.max(0.5, hopDelay + jitter);
        
        setCurrentLatency(latency);
        setCurrentJitter(Math.abs(jitter));
        setBottleneckSNR(minMargin);
        setPacketsReceived(r => r + 1);
        setCurrentThroughputKbps((payloadSize * 8 * packetRate));

        if (seq % 4 === 0) {
          addLog(`[SEQ #${seq}] ${payloadSize}B Echo Reply: RTT=${latency.toFixed(1)}ms TTL=64 SNR=${minMargin.toFixed(1)}dB`, 'packet');
          playBeep(980, 0.03);
        }
      }, intervalMs);

      return () => {
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      };
    } else {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    }
  }, [simMode, simState, packetRate, payloadSize, sourceNode, targetNode, failedNodeIds, sites, links, equipmentDB]);

  // Stop Stream
  const stopStream = () => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    setSimState('idle');
    addLog(`Packet Stream halted by operator.`, 'info');
  };

  // Reset counters
  const resetStats = () => {
    setPacketsSent(0);
    setPacketsReceived(0);
    setPacketsLost(0);
    setCurrentLatency(0);
    setCurrentJitter(0);
    setCurrentThroughputKbps(0);
    setBottleneckSNR(0);
    setActivePath(null);
    setSimState('idle');
    setLogs([]);
    addLog(`Simulation telemetry counters reset.`, 'info');
  };

  // D3 Force-Directed Topology Renderer
  useEffect(() => {
    if (!svgRef.current || sites.length === 0) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Responsive Zoom Container
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Defs: Gradients, Filters & Marker Glows
    const defs = svg.append('defs');

    // Cyber Glow Filter
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-30%')
      .attr('y', '-30%')
      .attr('width', '160%')
      .attr('height', '160%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    filter.append('feComposite')
      .attr('in', 'SourceGraphic')
      .attr('in2', 'blur')
      .attr('operator', 'over');

    // Clone Site data for D3
    const nodes = sites.map(s => ({
      ...s,
      isFailed: failedNodeIds.has(s.id),
      isSource: s.id === sourceNode,
      isTarget: s.id === targetNode,
      isInPath: activePath ? activePath.includes(s.id) : false,
    }));

    const edges = links.map(l => {
      const viability = checkLinkViability(l, sites, equipmentDB);
      let isActiveLink = false;
      if (activePath) {
        for (let i = 0; i < activePath.length - 1; i++) {
          if ((l.sourceSiteId === activePath[i] && l.targetSiteId === activePath[i + 1]) ||
              (l.sourceSiteId === activePath[i + 1] && l.targetSiteId === activePath[i])) {
            isActiveLink = true;
            break;
          }
        }
      }
      return {
        ...l,
        source: l.sourceSiteId,
        target: l.targetSiteId,
        viability,
        isActiveLink,
      };
    });

    // D3 Force Simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(140))
      .force('charge', d3.forceManyBody().strength(-550))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(50));

    // Draw Links Container
    const linkGroup = g.append('g').attr('class', 'links');
    
    // Draw Link Underlay Glow
    const linkHalo = linkGroup.selectAll('.link-halo')
      .data(edges)
      .enter().append('line')
      .attr('class', 'link-halo')
      .attr('stroke', (d: any) => {
        if (d.isActiveLink) return '#06b6d4';
        if (d.viability.isLosBlocked) return '#ef4444';
        return 'none';
      })
      .attr('stroke-width', (d: any) => d.isActiveLink ? 8 : (d.viability.isLosBlocked ? 6 : 0))
      .attr('opacity', 0.25);

    // Main Link Lines
    const link = linkGroup.selectAll('.link-main')
      .data(edges)
      .enter().append('line')
      .attr('class', 'link-main')
      .attr('stroke', (d: any) => {
        if (d.isActiveLink) return '#06b6d4'; // Glowing Cyan
        if (d.viability.isLosBlocked) return '#ef4444'; // Red Blocked
        if (d.viability.isViable) return '#475569'; // Slate Viable Standby
        return '#dc2626'; // Red Low Margin
      })
      .attr('stroke-width', (d: any) => (d.isActiveLink ? 4 : 2))
      .attr('stroke-dasharray', (d: any) => {
        if (d.isActiveLink) return 'none';
        if (d.viability.isLosBlocked) return '4, 4';
        if (!d.viability.isViable) return '2, 4';
        return 'none';
      })
      .attr('opacity', (d: any) => (d.isActiveLink ? 1 : 0.65));

    // Animated Live Packet Pulse Flowing on Active Links
    if (activePath && (simState === 'running' || simState === 'streaming' || simState === 'done')) {
      const activeEdges = edges.filter((e: any) => e.isActiveLink);
      const packetGroup = g.append('g').attr('class', 'packet-pulses');

      activeEdges.forEach((edge: any, idx) => {
        const pulse = packetGroup.append('circle')
          .attr('r', 5)
          .attr('fill', '#22d3ee')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 2)
          .style('filter', 'url(#glow)');

        // Append pulse animation
        pulse.append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0.2; 1; 0.2')
          .attr('dur', '1.2s')
          .attr('repeatCount', 'indefinite');
      });
    }

    // Draw Nodes Container
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const node = nodeGroup.selectAll('.node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node cursor-pointer')
      .call(d3.drag<SVGGElement, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d: any) => {
        event.stopPropagation();
        toggleNodeFailure(d.id);
      });

    // Outer Selection Halo
    node.append('circle')
      .attr('r', 24)
      .attr('fill', 'none')
      .attr('stroke', (d: any) => {
        if (d.isFailed) return '#ef4444';
        if (d.isSource) return '#f59e0b';
        if (d.isTarget) return '#ec4899';
        if (d.isInPath) return '#06b6d4';
        return 'transparent';
      })
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', (d: any) => d.isFailed ? '4, 3' : 'none')
      .style('filter', (d: any) => (d.isSource || d.isTarget || d.isInPath) ? 'url(#glow)' : 'none');

    // Core Node Body
    node.append('circle')
      .attr('r', 17)
      .attr('fill', (d: any) => {
        if (d.isFailed) return '#1e293b';
        if (d.type === 'base-station') return '#2563eb';
        if (d.type === 'repeater') return '#6366f1';
        if (d.type === 'microwave-node') return '#8b5cf6';
        if (d.type === 'relay') return '#0891b2';
        return '#059669';
      })
      .attr('stroke', (d: any) => (d.isFailed ? '#ef4444' : '#ffffff'))
      .attr('stroke-width', 2)
      .style('box-shadow', '0 4px 10px rgba(0,0,0,0.5)');

    // Node Type Abbreviation or Outage Cross
    node.append('text')
      .text((d: any) => {
        if (d.isFailed) return '✕';
        if (d.type === 'base-station') return 'BS';
        if (d.type === 'repeater') return 'RP';
        if (d.type === 'microwave-node') return 'MW';
        if (d.type === 'relay') return 'RL';
        return 'SUB';
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '4')
      .attr('font-size', '10px')
      .attr('font-weight', '900')
      .attr('fill', (d: any) => (d.isFailed ? '#ef4444' : '#ffffff'))
      .attr('font-family', 'ui-monospace, monospace');

    // Station Name Label
    node.append('text')
      .text((d: any) => d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', '34')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .attr('fill', (d: any) => (d.isFailed ? '#94a3b8' : '#f1f5f9'))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', '3px')
      .attr('paint-order', 'stroke')
      .attr('font-family', 'system-ui, sans-serif');

    // Elevation and Frequency Sub-Label
    node.append('text')
      .text((d: any) => `${d.elevation}m • ${d.txFreqMHz ? `${d.txFreqMHz}MHz` : d.type}`)
      .attr('text-anchor', 'middle')
      .attr('dy', '46')
      .attr('font-size', '9px')
      .attr('fill', '#94a3b8')
      .attr('font-family', 'ui-monospace, monospace');

    // Simulation Tick Update
    simulation.on('tick', () => {
      linkHalo
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
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
  }, [sites, links, sourceNode, targetNode, activePath, failedNodeIds, simState]);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-950/40">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                Tactical Network Simulation Engine
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                v2.4 DEM Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Force-directed mesh topology, real-time DEM clearance routing, packet flow latency, and fault failover.
            </p>
          </div>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
            title={soundEnabled ? 'Mute Audio Blips' : 'Enable Audio Feedback'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Reset All Counters */}
          <button
            type="button"
            onClick={resetStats}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Stats</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Dials Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4 font-mono">
        {/* KPI 1: Latency */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Round-Trip Delay</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-black text-cyan-300">
            {currentLatency > 0 ? `${currentLatency.toFixed(1)} ms` : '--'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Jitter: ±{currentJitter.toFixed(1)} ms
          </div>
        </div>

        {/* KPI 2: Bottleneck Margin */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Bottleneck SNR</span>
            <Signal className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className={`text-lg font-black ${bottleneckSNR >= 15 ? 'text-emerald-400' : bottleneckSNR >= 6 ? 'text-amber-400' : 'text-rose-400'}`}>
            {bottleneckSNR > 0 ? `+${bottleneckSNR.toFixed(1)} dB` : '--'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Target: &gt; +10 dB
          </div>
        </div>

        {/* KPI 3: Hop Count */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Active Hops</span>
            <Share2 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-lg font-black text-indigo-300">
            {activePath ? `${activePath.length - 1} Hops` : '--'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Nodes: {activePath ? activePath.length : 0}
          </div>
        </div>

        {/* KPI 4: Packets TX/RX */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Frames TX / RX</span>
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-lg font-black text-blue-300">
            {packetsSent} / {packetsReceived}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Loss: {packetsSent > 0 ? `${((packetsLost / packetsSent) * 100).toFixed(1)}%` : '0.0%'}
          </div>
        </div>

        {/* KPI 5: Throughput */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Channel Throughput</span>
            <Wifi className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-black text-amber-300">
            {currentThroughputKbps > 0 ? `${currentThroughputKbps.toFixed(1)} kbps` : '--'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Payload: {payloadSize} Bytes
          </div>
        </div>

        {/* KPI 6: Outages Injected */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Simulated Outages</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className={`text-lg font-black ${failedNodeIds.size > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {failedNodeIds.size} Nodes Down
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {failedNodeIds.size > 0 ? 'Rerouting Active' : 'All Online'}
          </div>
        </div>
      </div>

      {/* Main Simulation Workspace Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Left Side: Topology Interactive Canvas */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col relative overflow-hidden shadow-2xl">
          {/* Canvas Floating Top Overlay Badges */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 text-xs font-semibold pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 shadow-lg text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span>Base</span>
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 ml-1"></span>
              <span>Repeater</span>
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 ml-1"></span>
              <span>Microwave</span>
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 ml-1"></span>
              <span>Relay</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ml-1"></span>
              <span>Sub</span>
            </div>

            <div className="pointer-events-auto bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 shadow-lg text-[11px] text-slate-400">
              💡 Click any node to simulate <b>Station Outage / Failover</b>
            </div>
          </div>

          {/* D3 SVG Interactive Mesh Graph */}
          <svg 
            ref={svgRef} 
            className="w-full h-full rounded-xl bg-radial from-slate-900 to-slate-950 cursor-grab active:cursor-grabbing border border-slate-800/60"
          ></svg>

          {/* Canvas Bottom Legend / Instructions */}
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 pointer-events-none">
            <span>Scroll to Zoom</span>
            <span>•</span>
            <span>Drag Nodes to Reposition</span>
          </div>
        </div>

        {/* Right Side: Mission Control & Telemetry Panel */}
        <div className="w-full lg:w-96 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Mission Control Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-2.5 mb-3.5 border-b border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>Simulation Controller</span>
              </h3>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => { setSimMode('trace'); setSimState('idle'); }}
                  className={`px-2 py-0.5 rounded-md transition ${simMode === 'trace' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
                >
                  Trace
                </button>
                <button
                  type="button"
                  onClick={() => { setSimMode('stream'); setSimState('idle'); }}
                  className={`px-2 py-0.5 rounded-md transition ${simMode === 'stream' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
                >
                  Packet Stream
                </button>
              </div>
            </div>

            {/* Source & Destination Selectors */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  1. Source Station (TX Origin)
                </label>
                <select
                  value={sourceNode}
                  onChange={(e) => setSourceNode(e.target.value)}
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type.toUpperCase()}) {failedNodeIds.has(s.id) ? '⚠️ [DOWN]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Swap Button */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={() => {
                    const temp = sourceNode;
                    setSourceNode(targetNode);
                    setTargetNode(temp);
                  }}
                  className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 transition hover:rotate-180 duration-200"
                  title="Swap Origin and Destination"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  2. Destination Station (RX Target)
                </label>
                <select
                  value={targetNode}
                  onChange={(e) => setTargetNode(e.target.value)}
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type.toUpperCase()}) {failedNodeIds.has(s.id) ? '⚠️ [DOWN]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Packet Stream Options (if stream mode active) */}
              {simMode === 'stream' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Rate (pkts/sec)</label>
                    <select
                      value={packetRate}
                      onChange={(e) => setPacketRate(Number(e.target.value))}
                      className="w-full p-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-bold text-slate-200"
                    >
                      <option value={1}>1 pkt/s (Low)</option>
                      <option value={2}>2 pkts/s (Normal)</option>
                      <option value={5}>5 pkts/s (Voice)</option>
                      <option value={10}>10 pkts/s (Stress)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Payload Size</label>
                    <select
                      value={payloadSize}
                      onChange={(e) => setPayloadSize(Number(e.target.value))}
                      className="w-full p-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-bold text-slate-200"
                    >
                      <option value={64}>64 B (Ping)</option>
                      <option value={128}>128 B (DMR Voice)</option>
                      <option value={512}>512 B (Telemetry)</option>
                      <option value={1024}>1024 B (Data)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Simulation Action Buttons */}
            {simMode === 'trace' ? (
              <button
                type="button"
                onClick={runRouteTrace}
                disabled={simState === 'running' || sourceNode === targetNode}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-900/40 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {simState === 'running' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Analyzing Viable RF Hops...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Route Discovery</span>
                  </>
                )}
              </button>
            ) : (
              <div className="flex gap-2">
                {simState === 'streaming' ? (
                  <button
                    type="button"
                    onClick={stopStream}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg shadow-rose-900/40 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop Packet Stream</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setSimState('streaming'); addLog(`Started continuous packet stream...`, 'info'); }}
                    disabled={sourceNode === targetNode}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-extrabold text-xs shadow-lg shadow-cyan-900/40 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-white" />
                    <span>Start Live Stream</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Hop-by-Hop Breakdown List */}
          {pathHopsAnalysis.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <span>Hop-by-Hop Physical Breakdown</span>
                <span className="text-[10px] font-mono text-cyan-400">{pathHopsAnalysis.length} Hop(s)</span>
              </h3>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {pathHopsAnalysis.map((hop) => (
                  <div key={hop.hopIndex} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex items-center justify-between font-bold text-slate-200">
                      <span className="text-cyan-400">Hop #{hop.hopIndex}</span>
                      <span>{hop.distanceKm.toFixed(1)} km • {hop.frequencyMHz} MHz</span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                      <span>{hop.source.name}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span>{hop.target.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80">
                      <span className={hop.marginDB >= 10 ? 'text-emerald-400' : 'text-amber-400'}>
                        Margin: +{hop.marginDB.toFixed(1)} dB
                      </span>
                      <span className="text-slate-400">
                        PL: {hop.pathLossDB.toFixed(1)} dB • {hop.delayMs.toFixed(1)}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Telemetry & Event Console */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col min-h-[220px] overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Simulation Telemetry Console</span>
              </h3>
              <button
                type="button"
                onClick={() => setLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center mt-12 text-xs">
                  Awaiting simulation start...
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-600 text-[10px] select-none flex-shrink-0">
                      [{log.time}]
                    </span>
                    <span className={
                      log.type === 'error' ? 'text-rose-400 font-bold' :
                      log.type === 'success' ? 'text-emerald-400 font-bold' :
                      log.type === 'warning' ? 'text-amber-400 font-bold' :
                      log.type === 'packet' ? 'text-cyan-300' :
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
