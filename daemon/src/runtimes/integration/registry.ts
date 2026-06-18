/**
 * Channel Registry — manages registered channel adapters.
 *
 * Central registry for all channel adapters. Provides lookup by ID
 * and iteration over all registered channels.
 */

import type { ChannelAdapter, ChannelRegistryEntry } from "./types.js";

const channels = new Map<string, ChannelRegistryEntry>();

export function registerChannel(adapter: ChannelAdapter, enabled = true): void {
  channels.set(adapter.id, {
    adapter,
    enabled,
    registeredAt: new Date().toISOString(),
  });
}

export function unregisterChannel(channelId: string): boolean {
  return channels.delete(channelId);
}

export function getChannel(channelId: string): ChannelAdapter | undefined {
  const entry = channels.get(channelId);
  return entry?.enabled ? entry.adapter : undefined;
}

export function getChannelEntry(
  channelId: string,
): ChannelRegistryEntry | undefined {
  return channels.get(channelId);
}

export function getAllChannels(): ChannelRegistryEntry[] {
  return Array.from(channels.values());
}

export function getEnabledChannels(): ChannelAdapter[] {
  return Array.from(channels.values())
    .filter((e) => e.enabled)
    .map((e) => e.adapter);
}

export function setChannelEnabled(
  channelId: string,
  enabled: boolean,
): boolean {
  const entry = channels.get(channelId);
  if (!entry) return false;
  entry.enabled = enabled;
  return true;
}
