"use client";
import { useState, useEffect } from 'react';
import { PriceSource, TimeFrame } from '@/types';
import { PRICE_SOURCES, SUPPORTED_PAIRS } from '@/config/sources';

interface SourceSelectorProps {
  onConfigChange: (config: {
    source1: PriceSource;
    source2: PriceSource;
    symbol1: string;
    symbol2: string;
    timeframe: TimeFrame;
    limit: number;
  }) => void;
}

export default function SourceSelector({ onConfigChange }: SourceSelectorProps) {
  const [source1, setSource1] = useState<PriceSource>(PRICE_SOURCES[0]);
  const [source2, setSource2] = useState<PriceSource>(PRICE_SOURCES[1]);
  const [symbol1, setSymbol1] = useState('BTCUSDT');
  const [symbol2, setSymbol2] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<TimeFrame>('5m');
  const [limit, setLimit] = useState<number>(100);

  const timeframes: TimeFrame[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const s1 = params.get('source1');
    const s2 = params.get('source2');
    const sym1 = params.get('symbol1');
    const sym2 = params.get('symbol2');
    const tf = params.get('timeframe');
    const lim = params.get('limit');

    if (s1) {
      const found = PRICE_SOURCES.find(s => s.id === s1);
      if (found) setSource1(found);
    }
    if (s2) {
      const found = PRICE_SOURCES.find(s => s.id === s2);
      if (found) setSource2(found);
    }
    if (sym1) setSymbol1(sym1);
    if (sym2) setSymbol2(sym2);
    if (tf && timeframes.includes(tf as TimeFrame)) setTimeframe(tf as TimeFrame);
    if (lim && !isNaN(Number(lim))) setLimit(Number(lim));
  }, []);

  const isDexSource = (source: PriceSource) => source.type === 'DEX';
  const isLighterDex = (source: PriceSource) => source.id === 'lighter-dex';
  const isContractDex = (source: PriceSource) => isDexSource(source) && !isLighterDex(source);
  const isCustomSymbol = (source: PriceSource) =>
    source.id === 'binance-spot' || source.id === 'binance-futures';

  const handleAnalyze = () => {
    onConfigChange({
      source1,
      source2,
      symbol1,
      symbol2,
      timeframe,
      limit,
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Price Spread Analyzer</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source 1 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Source 1
          </label>
          <select
            value={source1.id}
            onChange={(e) => {
              const selected = PRICE_SOURCES.find((s) => s.id === e.target.value);
              if (selected) {
                setSource1(selected);
                if (selected.id === 'lighter-dex') {
                  setSymbol1('BTCUSD');
                } else if (selected.type === 'DEX') {
                  setSymbol1('');
                } else {
                  setSymbol1('BTCUSDT');
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {PRICE_SOURCES.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} ({source.type})
              </option>
            ))}
          </select>
          {/* Symbol/Contract input for Source 1 */}
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-1">
              {isLighterDex(source1) ? 'Symbol' : isContractDex(source1) ? 'Contract Address' : isCustomSymbol(source1) ? 'Symbol' : 'Trading Pair'}
            </label>
            {isLighterDex(source1) ? (
              <input
                type="text"
                value={symbol1}
                onChange={(e) => setSymbol1(e.target.value.toUpperCase())}
                placeholder="BTCUSD, ETHUSD, EURUSD"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              />
            ) : isCustomSymbol(source1) ? (
              <input
                type="text"
                value={symbol1}
                onChange={(e) => setSymbol1(e.target.value.toUpperCase())}
                placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              />
            ) : isContractDex(source1) ? (
              <input
                type="text"
                value={symbol1}
                onChange={(e) => setSymbol1(e.target.value)}
                placeholder="0x..."
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
              />
            ) : (
              <select
                value={symbol1}
                onChange={(e) => setSymbol1(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {SUPPORTED_PAIRS[source1.id]?.map((pair) => (
                  <option key={pair} value={pair}>
                    {pair}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {/* Source 2 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Source 2
          </label>
          <select
            value={source2.id}
            onChange={(e) => {
              const selected = PRICE_SOURCES.find((s) => s.id === e.target.value);
              if (selected) {
                setSource2(selected);
                if (selected.id === 'lighter-dex') {
                  setSymbol2('BTCUSD');
                } else if (selected.type === 'DEX') {
                  setSymbol2('');
                } else {
                  setSymbol2('BTCUSDT');
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
          >
            {PRICE_SOURCES.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} ({source.type})
              </option>
            ))}
          </select>
          {/* Symbol/Contract input for Source 2 */}
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-1">
              {isLighterDex(source2) ? 'Symbol' : isContractDex(source2) ? 'Contract Address' : isCustomSymbol(source2) ? 'Symbol' : 'Trading Pair'}
            </label>
            {isLighterDex(source2) ? (
              <input
                type="text"
                value={symbol2}
                onChange={(e) => setSymbol2(e.target.value.toUpperCase())}
                placeholder="BTCUSD, ETHUSD, EURUSD"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:outline-none text-sm"
              />
            ) : isCustomSymbol(source2) ? (
              <input
                type="text"
                value={symbol2}
                onChange={(e) => setSymbol2(e.target.value.toUpperCase())}
                placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:outline-none text-sm"
              />
            ) : isContractDex(source2) ? (
              <input
                type="text"
                value={symbol2}
                onChange={(e) => setSymbol2(e.target.value)}
                placeholder="0x..."
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:outline-none font-mono text-sm"
              />
            ) : (
              <select
                value={symbol2}
                onChange={(e) => setSymbol2(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
              >
                {SUPPORTED_PAIRS[source2.id]?.map((pair) => (
                  <option key={pair} value={pair}>
                    {pair}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {/* Timeframe */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Timeframe
          </label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as TimeFrame)}
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:outline-none"
          >
            {timeframes.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
        {/* Data Points Limit */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Data Points
          </label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.max(10, Math.min(1000, Number(e.target.value))))}
            min="10"
            max="1000"
            step="10"
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">Min: 10, Max: 1000</p>
        </div>
      </div>
      {/* Compare Info */}
      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-400">Comparing:</span>
          <span className="text-white font-medium">
            <span className="text-blue-400">{source1.name}</span>
            {' vs '}
            <span className="text-red-400">{source2.name}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-400 mb-1">Source 1:</div>
            <div className="text-white font-mono break-all">
              {symbol1 || 'Not set'}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-400 mb-1">Source 2:</div>
            <div className="text-white font-mono break-all">
              {symbol2 || 'Not set'}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-gray-400">Interval:</span>
          <span className="text-white">{timeframe}</span>
        </div>
      </div>
      {/* Analyze & Share Buttons */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleAnalyze}
          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
        >
          Analyze Spread
        </button>
        <button
          onClick={() => {
            const params = new URLSearchParams({
              source1: source1.id,
              source2: source2.id,
              symbol1,
              symbol2,
              timeframe,
              limit: String(limit),
            });
            const url = window.location.origin + window.location.pathname + '?' + params.toString();
            navigator.clipboard.writeText(url);
            alert('Link copied!');
          }}
          className="bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
          title="Copy shareable link with current config"
        >
          Share
        </button>
      </div>
    </div>
  );
}