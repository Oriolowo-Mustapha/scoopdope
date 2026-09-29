'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface WalletAddressProps {
  address: string;
  className?: string;
  addressLabel?: string;
}

export function WalletAddress({
  address,
  className = '',
  addressLabel = 'Wallet address',
}: WalletAddressProps) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <code className="min-w-0 flex-1 truncate text-xs" title={address}>
        {address}
      </code>
      <button
        type="button"
        onClick={copyAddress}
        className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={copied ? `${addressLabel} copied` : `Copy ${addressLabel.toLowerCase()}`}
        title={copied ? 'Copied' : 'Copy wallet address'}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
