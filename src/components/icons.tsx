import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  DashboardSquare01Icon,
  Download01Icon,
  File01Icon,
  Folder01Icon,
  InformationCircleIcon,
  LanguageCircleIcon,
  Link01Icon,
  Menu01Icon,
  Message01Icon,
  RefreshIcon,
  Search01Icon,
  SentIcon,
  Shield01Icon,
  Tick01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";

const icons = {
  add: Add01Icon,
  alert: Alert02Icon,
  back: ArrowLeft01Icon,
  forward: ArrowRight01Icon,
  external: ArrowUpRight01Icon,
  close: Cancel01Icon,
  complete: CheckmarkCircle01Icon,
  clock: Clock01Icon,
  dashboard: DashboardSquare01Icon,
  download: Download01Icon,
  file: File01Icon,
  folder: Folder01Icon,
  info: InformationCircleIcon,
  language: LanguageCircleIcon,
  link: Link01Icon,
  menu: Menu01Icon,
  chat: Message01Icon,
  refresh: RefreshIcon,
  search: Search01Icon,
  send: SentIcon,
  shield: Shield01Icon,
  tick: Tick01Icon,
  upload: Upload04Icon,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      strokeWidth={1.6}
      aria-hidden="true"
      className={className}
    />
  );
}
