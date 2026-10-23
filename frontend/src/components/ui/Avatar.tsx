import { initials } from '../../lib/format';
import type { UserType } from '../../lib/types';
import { BotIcon } from './icons';

const COLORS = ['bg-sky-600', 'bg-violet-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600'];

function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length]!;
}

type AvatarProps = {
  user: { id: string; name: string; type?: UserType };
  size?: 'sm' | 'md';
};

/** Round initials for humans; a square robot for agents so their work stands out. */
export function Avatar({ user, size = 'sm' }: AvatarProps) {
  const dimensions = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  if (user.type === 'agent') {
    return (
      <span
        title={`${user.name} (agente)`}
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white ${dimensions}`}
      >
        <BotIcon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'} />
      </span>
    );
  }
  return (
    <span
      title={user.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dimensions} ${colorFor(user.id)}`}
    >
      {initials(user.name)}
    </span>
  );
}
