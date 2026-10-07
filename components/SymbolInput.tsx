"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { DexTokenSuggestion, MarketInfo, PriceSource } from '@/types';
import { getMarkets, searchDexTokens, looksLikeAddress } from '@/services/marketsClient';
import { bestMarketForBase, searchMarkets } from '@/services/markets';

interface SymbolInputProps {
  source: PriceSource;
  value: string;
  // base = asset ticker of the chosen market/token (used to auto-match the other side)
  onChange: (value: string, base?: string) => void;
  // When the source changes, auto-select this asset if the new source lists it
  preferredBase?: string;
  accent: 'blue' | 'red';
}

type Item =
  | { kind: 'market'; market: MarketInfo }
  | { kind: 'token'; token: DexTokenSuggestion };

const fmtUsd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const fmtPrice = (n: number) => (n >= 1 ? n.toFixed(4) : n.toPrecision(4));
const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

export default function SymbolInput({ source, value, onChange, preferredBase, accent }: SymbolInputProps) {
  const isDex = source.inputKind === 'contract';
  const [markets, setMarkets] = useState<MarketInfo[] | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dexResults, setDexResults] = useState<DexTokenSuggestion[]>([]);
  const [dexLoading, setDexLoading] = useState(false);
  const [pickedToken, setPickedToken] = useState<DexTokenSuggestion | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the text box in sync when the parent changes the value (URL params, auto-match)
  useEffect(() => {
    setText(value);
  }, [value]);

  // Load the market list whenever the source changes
  useEffect(() => {
    setPickedToken(null);
    setDexResults([]);
    if (isDex) {
      setMarkets(null);
      return;
    }
    let cancelled = false;
    setMarkets(null);
    setMarketsError(null);
    getMarkets(source.id)
      .then((list) => !cancelled && setMarkets(list))
      .catch((err) => !cancelled && setMarketsError(err instanceof Error ? err.message : 'Failed to load pairs'));
    return () => {
      cancelled = true;
    };
  }, [source.id, isDex]);

  // Report the base of the current value, or (after a source switch / when the followed
  // asset changes) pick the same asset on this source
  useEffect(() => {
    if (!markets || markets.length === 0) return;
    const current = markets.find((m) => m.symbol.toUpperCase() === value.toUpperCase());
    if (current && (!preferredBase || current.base === preferredBase.toUpperCase())) {
      onChange(current.symbol, current.base);
      return;
    }
    const match = preferredBase ? bestMarketForBase(markets, preferredBase) : undefined;
    if (match) onChange(match.symbol, match.base);
    else if (current) onChange(current.symbol, current.base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, preferredBase]);

  // Debounced on-chain token search
  useEffect(() => {
    if (!isDex) return;
    const q = text.trim();
    if (q.length < 2 || (pickedToken && pickedToken.address === q)) {
      setDexResults([]);
      return;
    }
    let cancelled = false;
    setDexLoading(true);
    const t = setTimeout(() => {
      searchDexTokens(source.id, q)
        .then((r) => !cancelled && setDexResults(r))
        .catch(() => !cancelled && setDexResults([]))
        .finally(() => !cancelled && setDexLoading(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, isDex, source.id, pickedToken]);

  const items: Item[] = useMemo(() => {
    if (isDex) return dexResults.map((token) => ({ kind: 'token' as const, token }));
    if (!markets) return [];
    return searchMarkets(markets, text, 60).map((market) => ({ kind: 'market' as const, market }));
  }, [isDex, dexResults, markets, text]);

  useEffect(() => setHighlight(0), [items]);

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Keep highlighted row visible
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const select = (item: Item) => {
    if (item.kind === 'market') {
      setText(item.market.symbol);
      onChange(item.market.symbol, item.market.base);
    } else {
      setPickedToken(item.token);
      setText(item.token.address);
      onChange(item.token.address, item.token.symbol);
    }
    setOpen(false);
  };

  const handleTextChange = (t: string) => {
    setText(t);
    setOpen(true);
    if (isDex) {
      setPickedToken(null);
      // A pasted address is usable directly
      if (looksLikeAddress(t.trim())) onChange(t.trim());
    } else {
      const exact = markets?.find((m) => m.symbol.toUpperCase() === t.trim().toUpperCase());
      onChange(exact ? exact.symbol : t.trim().toUpperCase(), exact?.base);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && items[highlight]) {
        e.preventDefault();
        select(items[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const ring = accent === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-red-500';
  const activeRow = accent === 'blue' ? 'bg-blue-600/40' : 'bg-red-600/40';

  const currentMarket = !isDex ? markets?.find((m) => m.symbol.toUpperCase() === value.toUpperCase()) : undefined;
  const status = isDex
    ? pickedToken
      ? `${pickedToken.symbol} · ${pickedToken.name} · ${shortAddr(pickedToken.address)}`
      : 'Gõ tên/ticker token (vd: bt, pepe) hoặc dán contract address'
    : marketsError
      ? `Không tải được danh sách cặp: ${marketsError}`
      : !markets
        ? 'Đang tải danh sách cặp…'
        : currentMarket
          ? `${currentMarket.base}/${currentMarket.quote} · ${markets.length} cặp trên ${source.name}`
          : value
            ? `⚠ ${value} không có trong ${source.name} (${markets.length} cặp)`
            : `${markets.length} cặp trên ${source.name}`;

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={isDex ? 'Tìm token hoặc dán 0x… / mint address' : 'Gõ để tìm: bt → BTC, BTCB…'}
        autoComplete="off"
        spellCheck={false}
        className={`w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 ${ring} focus:outline-none text-sm ${isDex ? 'font-mono' : ''}`}
      />
      <p className={`text-xs mt-1 truncate ${status.startsWith('⚠') || marketsError ? 'text-yellow-400' : 'text-gray-400'}`}>
        {status}
      </p>

      {open && (items.length > 0 || (isDex && dexLoading && text.trim().length >= 2)) && (
        <ul
          ref={listRef}
          className="absolute z-30 left-0 right-0 top-[42px] max-h-72 overflow-y-auto bg-gray-900 border border-gray-600 rounded-lg shadow-2xl"
        >
          {items.length === 0 && dexLoading && (
            <li className="px-3 py-2 text-sm text-gray-400">Đang tìm…</li>
          )}
          {items.map((item, i) => (
            <li
              key={item.kind === 'market' ? item.market.symbol : item.token.address}
              onMouseDown={(e) => {
                e.preventDefault();
                select(item);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between gap-2 ${i === highlight ? activeRow : 'hover:bg-gray-800'}`}
            >
              {item.kind === 'market' ? (
                <>
                  <span className="text-white">
                    <span className="font-semibold">{item.market.base}</span>
                    <span className="text-gray-400">/{item.market.quote}</span>
                  </span>
                  <span className="text-xs text-gray-500 font-mono truncate">{item.market.symbol}</span>
                </>
              ) : (
                <>
                  <span className="min-w-0">
                    <span className="text-white font-semibold">{item.token.symbol}</span>
                    <span className="text-gray-400">/{item.token.quoteSymbol}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {item.token.name} · <span className="font-mono">{shortAddr(item.token.address)}</span>
                    </span>
                  </span>
                  <span className="text-right text-xs shrink-0">
                    <span className="block text-gray-300">${fmtPrice(item.token.priceUsd)}</span>
                    <span className="block text-gray-500">Liq {fmtUsd(item.token.liquidityUsd)}</span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
