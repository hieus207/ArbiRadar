'use client';

import { useState, useEffect, useRef } from 'react';
import { ChartConfig, SpreadData } from '@/types';
import { SpreadAnalyzer } from '@/services/spreadAnalyzer';

interface RealTimeMonitorProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChartConfig | null;
}

interface AlertHistory {
  timestamp: number;
  spread: number;
  source1Price: number;
  source2Price: number;
}

export default function RealTimeMonitor({ isOpen, onClose, config }: RealTimeMonitorProps) {
  const [currentSpread, setCurrentSpread] = useState<SpreadData | null>(null);
  const [alertThreshold, setAlertThreshold] = useState(1.0); // 1% default
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(5); // seconds
  const [minimized, setMinimized] = useState(false);
  const [alertZones, setAlertZones] = useState([
    { op: '>', value: 1.0, sound: 'https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3' }
  ]);
  // Cooldown state (seconds)
  const [alertCooldown, setAlertCooldown] = useState(10); // default 10s
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAlertTime = useRef<number>(0);

  // Thêm trạng thái bật/tắt âm cho từng zone
  const [zoneSoundEnabled, setZoneSoundEnabled] = useState(alertZones.map(() => true));
  // Đồng bộ khi thêm/xóa zone
  useEffect(() => {
    setZoneSoundEnabled(z => alertZones.map((_, i) => z[i] ?? true));
  }, [alertZones.length]);

  // Initialize audio
  useEffect(() => {
    // Create audio element for alert sound
    audioRef.current = new Audio('https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3');
  }, []);

  // Fetch real-time data
  const fetchRealTimeData = async () => {
    if (!config) return;

    try {
      const analyzer = new SpreadAnalyzer();
      const data = await analyzer.fetchDualSourceData({
        ...config,
        limit: 1, // Only get latest data
      });

      if (data.spreadData.length > 0) {
        const latest = data.spreadData[0];
        setCurrentSpread(latest);
        // Luôn kiểm tra alertZones, không phụ thuộc alertThreshold cũ
        triggerAlert(latest);
      }
    } catch (error) {
      console.error('Error fetching real-time data:', error);
    }
  };

  // Play sound by url, dùng 1 thẻ audio duy nhất để tránh bị browser chặn
  const playSound = (url: string) => {
    let soundUrl = url?.trim();
    if (!soundUrl) soundUrl = 'https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3';
    if (!/^https?:\/\//.test(soundUrl)) soundUrl = 'https://' + soundUrl.replace(/^\/*/, '');
    console.log('[DEBUG] playSound: called with', soundUrl);
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(soundUrl);
        console.log('[DEBUG] playSound: created new Audio', soundUrl);
      } else {
        if (audioRef.current.src !== soundUrl) {
          audioRef.current.src = soundUrl;
          console.log('[DEBUG] playSound: changed src', soundUrl);
        }
      }
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
      console.log('[DEBUG] playSound: about to play', audioRef.current.src, 'readyState:', audioRef.current.readyState);
      audioRef.current.play().then(() => {
        console.log('[DEBUG] playSound: play() success', soundUrl);
      }).catch((e) => {
        console.log('[DEBUG] playSound: play() failed', e);
        // fallback nếu link lỗi
        if (soundUrl !== 'https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3') {
          audioRef.current!.src = 'https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3';
          audioRef.current!.currentTime = 0;
          audioRef.current!.play();
        }
      });
    } catch (err) {
      console.log('[DEBUG] playSound: catch error', err);
      // fallback cuối cùng
      if (audioRef.current) {
        audioRef.current.src = 'https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3';
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      } else {
        console.log('[DEBUG] playSound: audioRef.current is null');
      }
    }
  };

  // Trigger alert for any matching zone, respect cooldown
  const triggerAlert = (spread: SpreadData) => {
    const now = Date.now();
    const spreadValue = spread.spreadPercent;
    let matched = false;
    alertZones.forEach((zone, idx) => {
      if (((zone.op === '>' && spreadValue > zone.value) || (zone.op === '<' && spreadValue < zone.value)) && zoneSoundEnabled[idx]) {
        console.log('[DEBUG] triggerAlert: matched zone', zone, 'soundEnabled:', soundEnabled, 'cooldown:', now - lastAlertTime.current, '>=', alertCooldown * 1000);
        if (now - lastAlertTime.current >= alertCooldown * 1000) {
          if (soundEnabled) {
            console.log('[DEBUG] triggerAlert: playSound called, about to call playSound()');
            playSound(zone.sound || 'https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3');
          } else {
            console.log('[DEBUG] triggerAlert: soundEnabled is false, skip playSound');
          }
          lastAlertTime.current = now;
          setAlertHistory(prev => [
            {
              timestamp: now,
              spread: spread.spreadPercent,
              source1Price: spread.source1Price,
              source2Price: spread.source2Price,
            },
            ...prev.slice(0, 19),
          ]);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Spread Alert! 🚨', {
              body: `Spread: ${spread.spreadPercent.toFixed(3)}%`,
              icon: '/favicon.ico',
            });
          }
        } else {
          console.log('[DEBUG] triggerAlert: cooldown not met');
        }
        matched = true;
      }
    });
    // Không set cooldown nếu không có zone nào thỏa mãn
  };

  // Request notification permission
  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  // Start/Stop monitoring
  useEffect(() => {
    if (isMonitoring && config) {
      // Fetch immediately
      fetchRealTimeData();
      
      // Then fetch at intervals
      intervalRef.current = setInterval(fetchRealTimeData, updateInterval * 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isMonitoring, config, updateInterval, alertThreshold]);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN');
  };

  // UI for alert zones
  const renderAlertZones = () => (
    <div className="space-y-2">
      {alertZones.map((zone, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <select value={zone.op} onChange={e => {
            const z = [...alertZones]; z[idx].op = e.target.value; setAlertZones(z);
          }} className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <input type="number" step="0.001" value={zone.value} onChange={e => {
            const z = [...alertZones]; z[idx].value = parseFloat(e.target.value) || 0; setAlertZones(z);
          }} className="w-20 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1" />
          <input type="text" value={zone.sound} onChange={e => {
            const z = [...alertZones]; z[idx].sound = e.target.value; setAlertZones(z);
          }} placeholder="Link nhạc (mặc định)" className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1" />
          <button onClick={() => setAlertZones(z => z.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-lg">×</button>
        </div>
      ))}
      <button onClick={() => setAlertZones(z => [...z, { op: '>', value: 1.0, sound: '' }])} className="text-xs text-blue-400 hover:text-blue-300 mt-1">+ Thêm dòng cảnh báo</button>
    </div>
  );

  if (!isOpen) return null;

  // Minimized floating widget
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
        <div className="bg-gray-900/90 rounded-lg shadow-xl p-4 flex flex-col min-w-[260px] max-w-xs" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400 font-bold" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>Real-Time Spread</div>
            <div className="flex gap-1">
              <button
                onClick={() => setMinimized(false)}
                className="text-gray-400 hover:text-white text-xl font-bold px-2"
                title="Mở rộng"
              >
                ＋
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-xl font-bold px-2"
                title="Đóng"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`text-2xl font-extrabold ${currentSpread && Math.abs(currentSpread.spreadPercent) >= (alertZones[0]?.value ?? 0) ? 'text-red-400 animate-pulse' : 'text-white'}`} style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {currentSpread ? `${currentSpread.spreadPercent >= 0 ? '+' : ''}${currentSpread.spreadPercent.toFixed(3)}%` : '--'}
            </div>
          </div>
          <div className="text-xs mb-2" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
            {currentSpread ? (
              <>
                <div><span style={{ color: '#fff', fontWeight: 700 }}>S1:</span> <span style={{ color: '#60a5fa', fontWeight: 700 }}>${currentSpread.source1Price.toFixed(3)}</span></div>
                <div><span style={{ color: '#fff', fontWeight: 700 }}>S2:</span> <span style={{ color: '#4ade80', fontWeight: 700 }}>${currentSpread.source2Price.toFixed(3)}</span></div>
                <div><span style={{ color: '#fff', fontWeight: 700 }}>Abs:</span> <span style={{ color: '#facc15', fontWeight: 700 }}>${Math.abs(currentSpread.spreadAbsolute).toFixed(3)}</span></div>
              </>
            ) : (
              <div>Đang lấy dữ liệu...</div>
            )}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setIsMonitoring(m => !m)}
              className={`px-2 py-1 rounded text-xs font-bold ${isMonitoring ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
              style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}
            >
              {isMonitoring ? 'Stop' : 'Start'} Monitoring
            </button>
          </div>
          <div className="text-xs text-gray-400 font-bold mb-1" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>Alert Zones</div>
          <div className="space-y-1">
            {alertZones.map((zone, idx) => (
              <div key={idx} className="flex items-center gap-2" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
                <span style={{ color: '#fff', fontWeight: 700 }}>{zone.op} {zone.value}</span>
                <button
                  onClick={() => setZoneSoundEnabled(z => z.map((v, i) => i === idx ? !v : v))}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${zoneSoundEnabled[idx] ? '' : 'bg-gray-600'}`}
                  style={{ background: zoneSoundEnabled[idx] ? '#22c55e' : '#374151' }}
                  title={zoneSoundEnabled[idx] ? 'Tắt âm dòng này' : 'Bật âm dòng này'}
                >
                  <span className="text-white text-xs">{zoneSoundEnabled[idx] ? '🔊' : '🔇'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Full popup
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📊 Real-Time Spread Monitor
            {isMonitoring && (
              <span className="inline-flex items-center gap-1 text-sm font-normal">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-green-400">Live</span>
              </span>
            )}
          </h2>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setMinimized(true)}
              className="text-gray-400 hover:text-white text-2xl leading-none"
              title="Thu nhỏ"
            >
              &minus;
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none"
              title="Đóng"
            >
              ×
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Configuration */}
          {config && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Monitoring Configuration</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Source 1:</span>
                  <span className="text-blue-400 ml-2">{config.source1.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">Source 2:</span>
                  <span className="text-green-400 ml-2">{config.source2.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">Symbol 1:</span>
                  <span className="text-white ml-2">{config.symbol1}</span>
                </div>
                <div>
                  <span className="text-gray-400">Symbol 2:</span>
                  <span className="text-white ml-2">{config.symbol2}</span>
                </div>
              </div>
            </div>
          )}

          {/* Current Spread Display */}
          <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-6 text-center">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Current Spread</h3>
            {currentSpread ? (
              <>
                <div className={`text-5xl font-bold mb-4 ${
                  Math.abs(currentSpread.spreadPercent) >= alertThreshold
                    ? 'text-red-400 animate-pulse'
                    : 'text-white'
                }`}>
                  {currentSpread.spreadPercent >= 0 ? '+' : ''}{currentSpread.spreadPercent.toFixed(3)}%
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Source 1 Price</div>
                    <div className="text-blue-400 font-semibold text-lg">
                      ${currentSpread.source1Price.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">Source 2 Price</div>
                    <div className="text-green-400 font-semibold text-lg">
                      ${currentSpread.source2Price.toFixed(3)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Absolute: ${Math.abs(currentSpread.spreadAbsolute).toFixed(3)}
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-lg">Waiting for data...</div>
            )}
          </div>

          {/* Settings */}
          <div className="space-y-4">
            {renderAlertZones()}
            <div className="flex items-center gap-2 mt-2">
              <label className="block text-sm font-medium text-gray-300">Thời gian tối thiểu giữa các alert (giây):</label>
              <input
                type="number"
                min={1}
                value={alertCooldown}
                onChange={e => setAlertCooldown(Number(e.target.value) || 1)}
                className="w-20 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 ml-2"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Sound Alert 🔔
              </label>
              <button
                onClick={requestNotificationPermission}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Enable Browser Notifications
              </button>
            </div>

            {/* Control Button */}
            <button
              onClick={() => {
                if (!config) {
                  alert('Please select sources and analyze first!');
                  return;
                }
                // Unlock audio autoplay by playing a muted sound
                try {
                  const unlockAudio = new Audio('https://tiengdong.com/wp-content/uploads/am-thanh-wow-www_tiengdong_com.mp3');
                  unlockAudio.muted = true;
                  unlockAudio.play().finally(() => {
                    setIsMonitoring(!isMonitoring);
                  });
                } catch {
                  setIsMonitoring(!isMonitoring);
                }
              }}
              disabled={!config}
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                isMonitoring
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed'
              }`}
            >
              {isMonitoring ? '⏸ Stop Monitoring' : '▶ Start Monitoring'}
            </button>
          </div>

          {/* Alert History */}
          {alertHistory.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">
                  Alert History ({alertHistory.length})
                </h3>
                <button
                  onClick={() => setAlertHistory([])}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {alertHistory.map((alert, index) => (
                  <div
                    key={index}
                    className="bg-gray-700 rounded p-3 text-sm border-l-4 border-red-500"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-white font-semibold">
                          Spread: {alert.spread >= 0 ? '+' : ''}{alert.spread.toFixed(3)}%
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          S1: ${alert.source1Price.toFixed(3)} | S2: ${alert.source2Price.toFixed(3)}
                        </div>
                      </div>
                      <div className="text-gray-500 text-xs">
                        {formatTime(alert.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
