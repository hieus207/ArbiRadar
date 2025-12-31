'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { PriceDataPoint, SpreadData } from '@/types';

interface PriceChartProps {
  source1Data: PriceDataPoint[];
  source2Data: PriceDataPoint[];
  spreadData: SpreadData[];
  source1Name: string;
  source2Name: string;
}

export default function PriceChart({
  source1Data,
  source2Data,
  spreadData,
  source1Name,
  source2Name,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredData, setHoveredData] = useState<SpreadData | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y1: number; y2: number } | null>(null);
  const [timezone, setTimezone] = useState<number>(0); // UTC offset in hours
  const [fillData, setFillData] = useState<{ x: number; y1: number; y2: number; spread: number }[]>([]);
  const source1SeriesRef = useRef<any>(null);
  const source2SeriesRef = useRef<any>(null);
  
  // Spread fill zones configuration
  const [fillZones, setFillZones] = useState<{ threshold: number; color: string; label: string }[]>([
    { threshold: 1, color: 'rgba(34, 197, 94, 0.8)', label: '< 1%' },
    { threshold: 2, color: 'rgba(59, 130, 246, 0.8)', label: '1-2%' },
    { threshold: 3, color: 'rgba(251, 191, 36, 0.8)', label: '2-3%' },
    { threshold: Infinity, color: 'rgba(239, 68, 68, 0.8)', label: '≥ 3%' },
  ]);
  const [showZoneEditor, setShowZoneEditor] = useState(false);
  const [showFillZones, setShowFillZones] = useState(false);

  const getFillColor = (spread: number) => {
    if (fillZones.length === 0) return 'rgba(128, 128, 128, 0.8)';
    
    // Sort zones by threshold ascending
    const sortedZones = [...fillZones].sort((a, b) => a.threshold - b.threshold);
    
    for (let i = 0; i < sortedZones.length; i++) {
      if (spread < sortedZones[i].threshold) {
        return sortedZones[i].color;
      }
    }
    // Return last zone color if spread exceeds all thresholds
    return sortedZones[sortedZones.length - 1].color;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2a2a2a',
        shiftVisibleRangeOnNewBar: true,
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          const date = new Date((timestamp + timezone * 3600) * 1000);
          const hours = date.getUTCHours().toString().padStart(2, '0');
          const minutes = date.getUTCMinutes().toString().padStart(2, '0');
          return `${hours}:${minutes}`;
        },
      },
    });

    chartRef.current = chart;

    // Add line series for source 1
    const source1Series = chart.addSeries(LineSeries);
    source1Series.applyOptions({
      color: '#3b82f6',
      lineWidth: 2,
      title: source1Name,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: 'price',
        precision: 3,
        minMove: 0.001,
      },
    });
    source1SeriesRef.current = source1Series;
    
    // Add line series for source 2
    const source2Series = chart.addSeries(LineSeries);
    source2Series.applyOptions({
      color: '#ef4444',
      lineWidth: 2,
      title: source2Name,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: 'price',
        precision: 3,
        minMove: 0.001,
      },
    });
    source2SeriesRef.current = source2Series;

    // Set data with validation
    console.log('Source 1 data:', source1Data.length, 'points');
    console.log('Source 2 data:', source2Data.length, 'points');
    
    if (source1Data.length > 0) {
      source1Series.setData(source1Data as any);
    }
    if (source2Data.length > 0) {
      source2Series.setData(source2Data as any);
    }

    // Calculate fill data for spread visualization
    const calculateFillData = () => {
      const fills: { x: number; y1: number; y2: number; spread: number }[] = [];
      const timeScale = chart.timeScale();
      
      spreadData.forEach((spread) => {
        const x = timeScale.timeToCoordinate(spread.time as any);
        const y1 = source1Series.priceToCoordinate(spread.source1Price);
        const y2 = source2Series.priceToCoordinate(spread.source2Price);
        
        if (x !== null && y1 !== null && y2 !== null) {
          fills.push({ x, y1, y2, spread: Math.abs(spread.spreadPercent) });
        }
      });
      
      setFillData(fills);
    };

    // Update fill data on visible range change
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      calculateFillData();
    });

    calculateFillData();

    // Handle crosshair move for tooltip and spread line
    chart.subscribeCrosshairMove((param: any) => {
      if (param.time && param.point) {
        const timestamp = param.time as number;
        const spread = spreadData.find((d) => d.time === timestamp);
        if (spread) {
          setHoveredData(spread);
          
          // Calculate Y positions for both prices using series coordinate
          const y1 = source1Series.priceToCoordinate(spread.source1Price);
          const y2 = source2Series.priceToCoordinate(spread.source2Price);
          
          if (y1 !== null && y2 !== null) {
            setMousePosition({
              x: param.point.x,
              y1,
              y2,
            });
          }
        }
      } else {
        setHoveredData(null);
        setMousePosition(null);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [source1Data, source2Data, spreadData]);

  // Update timezone when changed
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        localization: {
          timeFormatter: (timestamp: number) => {
            const date = new Date((timestamp + timezone * 3600) * 1000);
            const hours = date.getUTCHours().toString().padStart(2, '0');
            const minutes = date.getUTCMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
          },
        },
      });
    }
  }, [timezone]);

  return (
    <div className="relative">
      {/* Legend */}
      <div className="absolute top-4 right-4 bg-gray-900/95 border border-gray-700 rounded-lg p-3 text-sm z-10 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-blue-500"></div>
          <span className="text-white font-medium">{source1Name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-red-500"></div>
          <span className="text-white font-medium">{source2Name}</span>
        </div>
        <div className="border-t border-gray-700 pt-2 mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-400">Spread Fill:</div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFillZones(!showFillZones)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showFillZones ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => setShowZoneEditor(!showZoneEditor)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showZoneEditor ? 'Hide' : 'Edit'}
              </button>
            </div>
          </div>
          {[...fillZones].sort((a, b) => a.threshold - b.threshold).map((zone, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div 
                className="w-3 h-2"
                style={{ backgroundColor: zone.color }}
              ></div>
              <span className="text-gray-300">{zone.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zone Editor */}
      {showZoneEditor && (
        <div className="absolute top-4 left-4 bg-gray-900/95 border border-gray-700 rounded-lg p-4 text-sm z-20 w-80">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Edit Spread Zones</h3>
            <button
              onClick={() => setShowZoneEditor(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...fillZones].sort((a, b) => a.threshold - b.threshold).map((zone, originalIndex) => {
              const i = fillZones.indexOf(zone);
              return (
                <div key={i} className="flex items-center gap-2 bg-gray-800 p-2 rounded">
                  <input
                    type="number"
                    value={zone.threshold === Infinity ? '' : zone.threshold}
                    onChange={(e) => {
                      const newZones = [...fillZones];
                      newZones[i].threshold = e.target.value ? parseFloat(e.target.value) : Infinity;
                      setFillZones(newZones);
                    }}
                    placeholder="∞"
                    step="0.1"
                    className="w-16 bg-gray-700 text-white text-xs px-2 py-1 rounded"
                  />
                  <span className="text-gray-400 text-xs">%</span>
                  <input
                    type="color"
                    value={(() => {
                      const match = zone.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                      if (!match) return '#000000';
                      const [_, r, g, b] = match;
                      return '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
                    })()}
                    onChange={(e) => {
                      const hex = e.target.value;
                      const r = parseInt(hex.slice(1, 3), 16);
                      const g = parseInt(hex.slice(3, 5), 16);
                      const b = parseInt(hex.slice(5, 7), 16);
                      const newZones = [...fillZones];
                      newZones[i].color = `rgba(${r}, ${g}, ${b}, 0.8)`;
                      setFillZones(newZones);
                    }}
                    className="w-10 h-8 rounded cursor-pointer border border-gray-600"
                    style={{ padding: '2px' }}
                  />
                  <input
                    type="text"
                    value={zone.label}
                    onChange={(e) => {
                      const newZones = [...fillZones];
                      newZones[i].label = e.target.value;
                      setFillZones(newZones);
                    }}
                    placeholder="Label"
                    className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded"
                  />
                  <button
                    onClick={() => setFillZones(fillZones.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-300 text-xs px-2"
                    title="Delete zone"
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
          
          <button
            onClick={() => setFillZones([...fillZones, { threshold: 5, color: 'rgba(128, 128, 128, 0.8)', label: 'New' }])}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded"
          >
            + Add Zone
          </button>
        </div>
      )}

      {/* Timezone Selector */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 text-sm z-10">
        <select
          value={timezone}
          onChange={(e) => setTimezone(Number(e.target.value))}
          className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={0}>UTC+0</option>
          <option value={1}>UTC+1</option>
          <option value={2}>UTC+2</option>
          <option value={3}>UTC+3</option>
          <option value={4}>UTC+4</option>
          <option value={5}>UTC+5</option>
          <option value={6}>UTC+6</option>
          <option value={7}>UTC+7</option>
          <option value={8}>UTC+8</option>
          <option value={9}>UTC+9</option>
          <option value={-5}>UTC-5</option>
          <option value={-6}>UTC-6</option>
          <option value={-7}>UTC-7</option>
          <option value={-8}>UTC-8</option>
          <option value={new Date().getTimezoneOffset() / -60}>Local Time</option>
        </select>
      </div>

      <div ref={chartContainerRef} className="rounded-lg overflow-hidden relative">
        {/* Fill areas between lines based on spread % */}
        <svg
          className="absolute top-0 left-0 pointer-events-none z-10"
          style={{ width: '100%', height: '500px' }}
        >
          {showFillZones && fillData.map((point, i) => {
            if (i === 0) return null;
            
            const prev = fillData[i - 1];
            const spread = point.spread;
            const fillColor = getFillColor(spread);
            
            return (
              <polygon
                key={i}
                points={`${prev.x},${prev.y1} ${prev.x},${prev.y2} ${point.x},${point.y2} ${point.x},${point.y1}`}
                fill={fillColor}
              />
            );
          })}
        </svg>

        {/* Spread line overlay */}
        {mousePosition && hoveredData && (
          <svg
            className="absolute top-0 left-0 pointer-events-none z-20"
            style={{ width: '100%', height: '500px' }}
          >
            {/* Vertical spread line - solid */}
            <line
              x1={mousePosition.x}
              y1={mousePosition.y1}
              x2={mousePosition.x}
              y2={mousePosition.y2}
              stroke="#fbbf24"
              strokeWidth="3"
              opacity="0.8"
            />
            {/* Top circle */}
            <circle
              cx={mousePosition.x}
              cy={mousePosition.y1}
              r="4"
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="2"
            />
            {/* Bottom circle */}
            <circle
              cx={mousePosition.x}
              cy={mousePosition.y2}
              r="4"
              fill="#ef4444"
              stroke="#fff"
              strokeWidth="2"
            />
            {/* Spread value label */}
            <g>
              <rect
                x={mousePosition.x + 8}
                y={Math.min(mousePosition.y1, mousePosition.y2) + Math.abs(mousePosition.y1 - mousePosition.y2) / 2 - 14}
                width="85"
                height="28"
                fill="#fbbf24"
                rx="6"
                stroke="#000"
                strokeWidth="1"
              />
              <text
                x={mousePosition.x + 50}
                y={Math.min(mousePosition.y1, mousePosition.y2) + Math.abs(mousePosition.y1 - mousePosition.y2) / 2 + 5}
                textAnchor="middle"
                fill="#000"
                fontSize="14"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {hoveredData.spreadPercent > 0 ? '+' : ''}{hoveredData.spreadPercent.toFixed(2)}%
              </text>
            </g>
          </svg>
        )}
      </div>
      
      {/* Tooltip */}
      {hoveredData && (
        <div className="absolute top-4 left-4 bg-gray-900/95 border border-gray-700 rounded-lg p-4 text-sm space-y-2">
          <div className="font-semibold text-white mb-2">
            {new Date(hoveredData.time * 1000).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-gray-300">{source1Name}:</span>
            <span className="text-white font-mono">
              ${hoveredData.source1Price.toFixed(3)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-300">{source2Name}:</span>
            <span className="text-white font-mono">
              ${hoveredData.source2Price.toFixed(3)}
            </span>
          </div>
          <div className="border-t border-gray-700 pt-2 mt-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-300">Spread:</span>
              <span
                className={`font-mono font-semibold ${
                  hoveredData.spreadPercent > 0
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {hoveredData.spreadPercent > 0 ? '+' : ''}
                {hoveredData.spreadPercent.toFixed(3)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 mt-1">
              <span className="text-gray-300">Absolute:</span>
              <span className="text-white font-mono">
                ${Math.abs(hoveredData.spreadAbsolute).toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
