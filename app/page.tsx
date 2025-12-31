'use client';

import { useState } from 'react';
import SourceSelector from '@/components/SourceSelector';
import PriceChart from '@/components/PriceChart';
import RealTimeMonitor from '@/components/RealTimeMonitor';
import { SpreadAnalyzer } from '@/services/spreadAnalyzer';
import { ChartConfig, PriceDataPoint, SpreadData } from '@/types';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [showRealTimeMonitor, setShowRealTimeMonitor] = useState(false);
  const [chartData, setChartData] = useState<{
    source1Data: PriceDataPoint[];
    source2Data: PriceDataPoint[];
    spreadData: SpreadData[];
    config: ChartConfig;
  } | null>(null);

  const handleConfigChange = async (config: ChartConfig) => {
    setLoading(true);
    setError(null);

    try {
      const analyzer = new SpreadAnalyzer();
      const data = await analyzer.fetchDualSourceData(config);

      setChartData({
        ...data,
        config,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const analyzeSpread = () => {
    if (!chartData || chartData.spreadData.length === 0) return;

    // Step 1: Find local peaks (entry points) and analyze convergence
    const peaks: Array<{
      index: number;
      spread: number;
      time: number;
      convergenceTime: number | null;
      convergenceSpread: number | null;
      profit: number;
    }> = [];

    // Identify peaks (local maxima where spread starts decreasing)
    for (let i = 1; i < chartData.spreadData.length - 1; i++) {
      const prev = Math.abs(chartData.spreadData[i - 1].spreadPercent);
      const curr = Math.abs(chartData.spreadData[i].spreadPercent);
      const next = Math.abs(chartData.spreadData[i + 1].spreadPercent);

      // Peak condition: current > both neighbors OR significant spike
      if ((curr > prev && curr > next) || (curr > prev * 1.1)) {
        // Find convergence point (when spread drops significantly)
        let convergenceIndex = null;
        let minSpreadAfterPeak = curr;
        
        // Look ahead to find when it converges (drops at least 30% from peak)
        for (let j = i + 1; j < Math.min(i + 50, chartData.spreadData.length); j++) {
          const futureSpread = Math.abs(chartData.spreadData[j].spreadPercent);
          if (futureSpread < minSpreadAfterPeak) {
            minSpreadAfterPeak = futureSpread;
          }
          
          // Convergence = dropped at least 30% from peak
          if (futureSpread <= curr * 0.7) {
            convergenceIndex = j;
            break;
          }
        }

        if (convergenceIndex !== null) {
          const convergenceData = chartData.spreadData[convergenceIndex];
          peaks.push({
            index: i,
            spread: curr,
            time: chartData.spreadData[i].time,
            convergenceTime: convergenceData.time - chartData.spreadData[i].time,
            convergenceSpread: Math.abs(convergenceData.spreadPercent),
            profit: curr - Math.abs(convergenceData.spreadPercent),
          });
        }
      }
    }

    // Step 2: Cluster peaks by spread level (±0.1% buckets)
    const buckets: { [key: string]: typeof peaks } = {};
    peaks.forEach(peak => {
      const bucket = Math.round(peak.spread * 10) / 10; // Round to 0.1%
      const key = bucket.toFixed(1);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(peak);
    });

    // Step 3: Analyze each bucket
    const recommendations: Array<{
      entrySpread: number;
      frequency: number;
      avgConvergenceTime: number;
      avgProfit: number;
      successRate: number;
      avgExitSpread: number;
      score: number;
    }> = [];

    Object.keys(buckets).forEach(key => {
      const peaksInBucket = buckets[key];
      if (peaksInBucket.length < 2) return; // Need at least 2 occurrences

      const avgConvergenceTime = peaksInBucket.reduce((sum, p) => sum + (p.convergenceTime || 0), 0) / peaksInBucket.length;
      const avgProfit = peaksInBucket.reduce((sum, p) => sum + p.profit, 0) / peaksInBucket.length;
      const avgExitSpread = peaksInBucket.reduce((sum, p) => sum + (p.convergenceSpread || 0), 0) / peaksInBucket.length;

      // Score calculation
      const frequencyScore = Math.min(peaksInBucket.length / 10, 1); // Normalize to max 10 occurrences
      const profitScore = Math.min(avgProfit / 2, 1); // Normalize to max 2% profit
      const speedScore = avgConvergenceTime > 0 ? Math.max(0, 1 - avgConvergenceTime / 3600) : 0; // Prefer < 1 hour
      
      const totalScore = (frequencyScore * 0.3) + (profitScore * 0.4) + (speedScore * 0.3);

      recommendations.push({
        entrySpread: parseFloat(key),
        frequency: peaksInBucket.length,
        avgConvergenceTime,
        avgProfit,
        successRate: 100, // All found peaks converged by definition
        avgExitSpread,
        score: totalScore,
      });
    });

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    // Step 4: Traditional zone analysis (keep for reference)
    const zones = [
      { threshold: 1, label: '< 1%' },
      { threshold: 2, label: '1-2%' },
      { threshold: 3, label: '2-3%' },
      { threshold: Infinity, label: '≥ 3%' },
    ];

    const zoneStats: any = {};
    
    zones.forEach((zone, i) => {
      const prevThreshold = i > 0 ? zones[i - 1].threshold : 0;
      const key = `${prevThreshold}-${zone.threshold === Infinity ? '∞' : zone.threshold}`;
      zoneStats[key] = {
        label: zone.label,
        count: 0,
        durations: [],
        timestamps: [],
      };
    });

    let currentZone: string | null = null;
    let zoneStartTime: number | null = null;
    let lastZoneEndTime: { [key: string]: number } = {};

    chartData.spreadData.forEach((data, i) => {
      const spread = Math.abs(data.spreadPercent);
      
      let zoneKey = null;
      for (let j = 0; j < zones.length; j++) {
        const prevThreshold = j > 0 ? zones[j - 1].threshold : 0;
        if (spread >= prevThreshold && spread < zones[j].threshold) {
          zoneKey = `${prevThreshold}-${zones[j].threshold === Infinity ? '∞' : zones[j].threshold}`;
          break;
        }
      }

      if (!zoneKey) return;

      if (zoneKey !== currentZone) {
        if (currentZone && zoneStartTime !== null) {
          const duration = data.time - zoneStartTime;
          zoneStats[currentZone].durations.push(duration);
          lastZoneEndTime[currentZone] = data.time;
        }
        
        currentZone = zoneKey;
        zoneStartTime = data.time;
        zoneStats[zoneKey].count++;
        
        if (lastZoneEndTime[zoneKey]) {
          const interval = data.time - lastZoneEndTime[zoneKey];
          zoneStats[zoneKey].timestamps.push(interval);
        }
      }
    });

    if (currentZone && zoneStartTime !== null && chartData.spreadData.length > 0) {
      const lastData = chartData.spreadData[chartData.spreadData.length - 1];
      const duration = lastData.time - zoneStartTime;
      zoneStats[currentZone].durations.push(duration);
    }

    Object.keys(zoneStats).forEach(key => {
      const durations = zoneStats[key].durations;
      const intervals = zoneStats[key].timestamps;
      
      zoneStats[key].avgDuration = durations.length > 0
        ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
        : 0;
      
      zoneStats[key].minDuration = durations.length > 0 ? Math.min(...durations) : 0;
      zoneStats[key].maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
      
      zoneStats[key].avgInterval = intervals.length > 0
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length
        : 0;
      
      zoneStats[key].minInterval = intervals.length > 0 ? Math.min(...intervals) : 0;
      zoneStats[key].maxInterval = intervals.length > 0 ? Math.max(...intervals) : 0;
    });

    let mostFrequentZone = '';
    let maxCount = 0;
    Object.keys(zoneStats).forEach(key => {
      if (zoneStats[key].count > maxCount) {
        maxCount = zoneStats[key].count;
        mostFrequentZone = key;
      }
    });

    setAnalysisResult({
      zoneStats,
      mostFrequentZone,
      recommendations: recommendations.slice(0, 5), // Top 5 specific entry points
      totalDataPoints: chartData.spreadData.length,
      timeRange: chartData.spreadData.length > 0 
        ? chartData.spreadData[chartData.spreadData.length - 1].time - chartData.spreadData[0].time 
        : 0,
    });
    setShowAnalysis(true);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🔍 Price Spread Analyzer
          </h1>
          <p className="text-gray-400">
            Compare prices across any DEX or CEX exchanges
          </p>
        </div>

        {/* Source Selector */}
        <div className="mb-8">
          <SourceSelector onConfigChange={handleConfigChange} />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-gray-300 mt-4">Fetching price data...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-200">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Chart */}
        {!loading && !error && chartData && (
          <div className="bg-gray-800 rounded-lg p-6">
            <PriceChart
              source1Data={chartData.source1Data}
              source2Data={chartData.source2Data}
              spreadData={chartData.spreadData}
              source1Name={chartData.config.source1.name}
              source2Name={chartData.config.source2.name}
            />
            
            {/* Spread Stats */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Average Spread</div>
                <div className="text-white text-2xl font-bold mt-1">
                  {(
                    chartData.spreadData.reduce((sum, d) => sum + Math.abs(d.spreadPercent), 0) /
                    chartData.spreadData.length
                  ).toFixed(3)}%
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Max Spread</div>
                <div className="text-green-400 text-2xl font-bold mt-1">
                  {Math.max(...chartData.spreadData.map(d => Math.abs(d.spreadPercent))).toFixed(3)}%
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Data Points</div>
                <div className="text-blue-400 text-2xl font-bold mt-1">
                  {chartData.spreadData.length}
                </div>
              </div>
            </div>

            {/* Analysis Button */}
            <div className="mt-6 flex gap-4 justify-center">
              <button
                onClick={analyzeSpread}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 rounded-lg font-semibold text-lg shadow-lg transition-all"
              >
                📈 Analyze Spread Zones
              </button>
              <button
                onClick={() => setShowRealTimeMonitor(true)}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-8 py-3 rounded-lg font-semibold text-lg shadow-lg transition-all flex items-center gap-2"
              >
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                📡 Real-Time Monitor
              </button>
            </div>
          </div>
        )}

        {/* Analysis Panel */}
        {showAnalysis && analysisResult && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Spread Zone Analysis</h2>
              <button
                onClick={() => setShowAnalysis(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Total Data Points</div>
                <div className="text-white text-2xl font-bold mt-1">{analysisResult.totalDataPoints}</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Time Range</div>
                <div className="text-white text-2xl font-bold mt-1">{formatDuration(analysisResult.timeRange)}</div>
              </div>
            </div>

            {/* Trading Recommendations */}
            {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
              <div className="mb-6 bg-gradient-to-r from-green-900/30 to-blue-900/30 border-2 border-green-500/50 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  💡 Khuyến nghị mốc vào lệnh cụ thể (Dựa trên phân tích dữ liệu thực tế)
                </h3>
                <div className="space-y-3">
                  {analysisResult.recommendations.map((rec: any, i: number) => (
                    <div 
                      key={i}
                      className={`bg-gray-900/50 rounded-lg p-4 ${
                        i === 0 ? 'ring-2 ring-green-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {i === 0 && <span className="text-2xl">🏆</span>}
                          {i === 1 && <span className="text-2xl">🥈</span>}
                          {i === 2 && <span className="text-2xl">🥉</span>}
                          <div>
                            <div className="text-white font-bold text-xl">
                              Vào lệnh tại: <span className="text-green-400">{rec.entrySpread.toFixed(2)}%</span>
                            </div>
                            <div className="text-gray-400 text-sm">
                              Thoát trung bình: <span className="text-blue-400">{rec.avgExitSpread.toFixed(2)}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Điểm đánh giá</div>
                          <div className="text-green-400 font-bold text-xl">{(rec.score * 100).toFixed(0)}/100</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="bg-gray-800/50 rounded p-2">
                          <div className="text-gray-400 text-xs">Xuất hiện</div>
                          <div className="text-white font-bold">{rec.frequency}x</div>
                        </div>
                        <div className="bg-gray-800/50 rounded p-2">
                          <div className="text-gray-400 text-xs">Lợi nhuận TB</div>
                          <div className="text-green-400 font-bold">+{rec.avgProfit.toFixed(2)}%</div>
                        </div>
                        <div className="bg-gray-800/50 rounded p-2">
                          <div className="text-gray-400 text-xs">Thời gian hội tụ</div>
                          <div className="text-blue-400 font-bold">{formatDuration(rec.avgConvergenceTime)}</div>
                        </div>
                      </div>
                      
                      {i === 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <p className="text-sm text-gray-300">
                            ✅ <strong>Mốc vào lệnh tối ưu:</strong> Khi spread chạm <strong className="text-green-400">{rec.entrySpread.toFixed(2)}%</strong>, 
                            đã xuất hiện <strong>{rec.frequency} lần</strong> và hội tụ về mức thấp hơn 
                            sau trung bình <strong className="text-blue-400">{formatDuration(rec.avgConvergenceTime)}</strong> với 
                            lợi nhuận trung bình <strong className="text-green-400">+{rec.avgProfit.toFixed(2)}%</strong>.
                          </p>
                          <p className="text-sm text-yellow-300 mt-2">
                            💡 <strong>Chiến lược:</strong> Long Spot + Short Futures khi spread đạt {rec.entrySpread.toFixed(2)}%, 
                            chốt lời khi về {rec.avgExitSpread.toFixed(2)}%.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.keys(analysisResult.zoneStats).map((key) => {
                const stats = analysisResult.zoneStats[key];
                const isFrequent = key === analysisResult.mostFrequentZone;
                
                return (
                  <div
                    key={key}
                    className={`bg-gray-900/50 rounded-lg p-4 ${
                      isFrequent ? 'ring-2 ring-yellow-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-bold text-lg">{stats.label}</h3>
                      {isFrequent && <span className="text-yellow-400 text-xl">🔥</span>}
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Các lần xuất hiện:</span>
                        <span className="text-white font-bold">{stats.count}x</span>
                      </div>
                      
                      {stats.avgDuration > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Thời lượng trung bình:</span>
                            <span className="text-blue-400 font-mono">{formatDuration(stats.avgDuration)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Khoảng thời gian trung bình:</span>
                            <span className="text-green-400 font-mono">{formatDuration(stats.minDuration)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Khoảng thời gian tối thiểu:</span>
                            <span className="text-purple-400 font-mono">{formatDuration(stats.minDuration)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Khoảng thời gian tối đa:</span>
                            <span className="text-orange-400 font-mono">{formatDuration(stats.maxDuration)}</span>
                          </div>
                        </>
                      )}
                      
                      {stats.avgInterval > 0 && (
                        <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                          <span className="text-gray-400">Khoảng cách giữa các lần:</span>
                          <span className="text-cyan-400 font-mono">{formatDuration(stats.avgInterval)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Real-Time Monitor Popup */}
      <RealTimeMonitor
        isOpen={showRealTimeMonitor}
        onClose={() => setShowRealTimeMonitor(false)}
        config={chartData?.config || null}
      />
    </div>
  );
}
