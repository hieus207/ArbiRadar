"use client";
import { useState, useEffect } from 'react';
import { PriceSource, TimeFrame } from '@/types';
import { PRICE_SOURCES, SOURCE_GROUPS, findSource } from '@/config/sources';
import SymbolInput from './SymbolInput';

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

const timeframes: TimeFrame[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

function SourceSelect({
  value,
  onChange,
  accent,
}: {
  value: PriceSource;
  onChange: (s: PriceSource) => void;
  accent: 'blue' | 'red';
}) {
  return (
    <select
      value={value.id}
      onChange={(e) => {
        const selected = findSource(e.target.value);
        if (selected) onChange(selected);
      }}
      className={`w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:ring-2 ${accent === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-red-500'} focus:outline-none`}
    >
      {SOURCE_GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {PRICE_SOURCES.filter((s) => s.group === group).map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function SourceSelector({ onConfigChange }: SourceSelectorProps) {
  const [source1, setSource1] = useState<PriceSource>(findSource('binance-spot')!);
  const [source2, setSource2] = useState<PriceSource>(findSource('binance-futures')!);
  const [symbol1, setSymbol1] = useState('BTCUSDT');
  const [symbol2, setSymbol2] = useState('BTCUSDT');
  // Asset tickers of the chosen markets; source 2 follows the asset of source 1
  const [base1, setBase1] = useState<string | undefined>('BTC');
  const [base2, setBase2] = useState<string | undefined>('BTC');
  const [timeframe, setTimeframe] = useState<TimeFrame>('5m');
  const [limit, setLimit] = useState<number>(100);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const s1 = findSource(params.get('source1'));
    const s2 = findSource(params.get('source2'));
    const sym1 = params.get('symbol1');
    const sym2 = params.get('symbol2');
    const tf = params.get('timeframe');
    const lim = params.get('limit');

    if (s1) setSource1(s1);
    if (s2) setSource2(s2);
    if (sym1 !== null) {
      setSymbol1(sym1);
      setBase1(undefined);
    }
    if (sym2 !== null) {
      setSymbol2(sym2);
      setBase2(undefined);
    }
    if (tf && timeframes.includes(tf as TimeFrame)) setTimeframe(tf as TimeFrame);
    if (lim && !isNaN(Number(lim))) setLimit(Number(lim));
  }, []);

  // Switching between symbol-based and contract-based sources invalidates the value;
  // symbol -> symbol keeps it and SymbolInput re-matches the same asset on the new source.
  const changeSource = (
    next: PriceSource,
    prev: PriceSource,
    setSource: (s: PriceSource) => void,
    setSymbol: (s: string) => void
  ) => {
    setSource(next);
    if (next.inputKind !== prev.inputKind || next.inputKind === 'contract') setSymbol('');
  };

  const handleAnalyze = () => {
    onConfigChange({ source1, source2, symbol1, symbol2, timeframe, limit });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Price Spread Analyzer</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source 1 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Source 1</label>
          <SourceSelect
            value={source1}
            accent="blue"
            onChange={(s) => changeSource(s, source1, setSource1, setSymbol1)}
          />
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-1">
              {source1.inputKind === 'contract' ? 'Token (tên / contract)' : 'Cặp giao dịch'}
            </label>
            <SymbolInput
              source={source1}
              value={symbol1}
              accent="blue"
              preferredBase={base1}
              onChange={(v, b) => {
                setSymbol1(v);
                if (b) setBase1(b.toUpperCase());
              }}
            />
          </div>
        </div>
        {/* Source 2 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Source 2</label>
          <SourceSelect
            value={source2}
            accent="red"
            onChange={(s) => changeSource(s, source2, setSource2, setSymbol2)}
          />
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-1">
              {source2.inputKind === 'contract' ? 'Token (tên / contract)' : 'Cặp giao dịch'}
            </label>
            <SymbolInput
              source={source2}
              value={symbol2}
              accent="red"
              preferredBase={base1 ?? base2}
              onChange={(v, b) => {
                setSymbol2(v);
                if (b) setBase2(b.toUpperCase());
              }}
            />
          </div>
        </div>
        {/* Timeframe */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Timeframe</label>
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
          <label className="block text-sm font-medium text-gray-300 mb-2">Data Points</label>
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
            <div className="text-white font-mono break-all">{symbol1 || 'Not set'}</div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-400 mb-1">Source 2:</div>
            <div className="text-white font-mono break-all">{symbol2 || 'Not set'}</div>
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
          disabled={!symbol1 || !symbol2}
          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
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
