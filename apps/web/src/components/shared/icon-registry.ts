// Merkezi icon registry — proje tüm icon'ları buradan alır.
// Tüm bileşenler lucide-animated.com (pqoqubbw) kaynaklı, hover-tetikli animasyonlu.
// Yeni icon eklemek için:
//   npx --yes shadcn@latest add "https://lucide-animated.com/r/<name>.json"
// sonra aşağıdaki haritaya kayıt ekle.

import { ArchiveIcon } from "@/components/ui/archive";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";
import { BellIcon } from "@/components/ui/bell";
import { SearchIcon } from "@/components/ui/search";
import { ZapIcon } from "@/components/ui/zap";
import { SparklesIcon } from "@/components/ui/sparkles";
import { BlocksIcon } from "@/components/ui/blocks";
import { BookTextIcon } from "@/components/ui/book-text";
import { TerminalIcon } from "@/components/ui/terminal";
import { BookmarkIcon } from "@/components/ui/bookmark";
import { BookmarkPlusIcon } from "@/components/ui/bookmark-plus";
import { BriefcaseBusinessIcon } from "@/components/ui/briefcase-business";
import { CalendarDaysIcon } from "@/components/ui/calendar-days";
import { ChartBarIncreasingIcon } from "@/components/ui/chart-bar-increasing";
import { ChartPieIcon } from "@/components/ui/chart-pie";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { CircleDollarSignIcon } from "@/components/ui/circle-dollar-sign";
import { CircleCheckIcon } from "@/components/ui/circle-check";
import { CircleDashedIcon } from "@/components/ui/circle-dashed";
import { ClockIcon } from "@/components/ui/clock";
import { CoffeeIcon } from "@/components/ui/coffee";
import { ConstructionIcon } from "@/components/ui/construction";
import { FileTextIcon } from "@/components/ui/file-text";
import { GraduationCapIcon } from "@/components/ui/graduation-cap";
import { HomeIcon } from "@/components/ui/home";
import { LayersIcon, type LayersIconHandle } from "@/components/ui/layers";
import { MailboxIcon } from "@/components/ui/mailbox";
import { MoonIcon } from "@/components/ui/moon";
import { MonitorCheckIcon } from "@/components/ui/monitor-check";
import { MessageSquareIcon } from "@/components/ui/message-square";
import { PhoneIcon } from "@/components/ui/phone";
import { PlusIcon } from "@/components/ui/plus";
import { ReceiptIcon } from "@/components/ui/receipt";
import { SettingsIcon } from "@/components/ui/settings";
import { SquarePenIcon } from "@/components/ui/square-pen";
import { PauseIcon } from "@/components/ui/pause";
import { PlayIcon } from "@/components/ui/play";
import { DeleteIcon } from "@/components/ui/delete";
import { SunIcon } from "@/components/ui/sun";
import { SunsetIcon } from "@/components/ui/sunset";
import { ShieldCheckIcon } from "@/components/ui/shield-check";
import { LockKeyholeIcon } from "@/components/ui/lock-keyhole";
import { TrendingUpIcon } from "@/components/ui/trending-up";
import { UserIcon } from "@/components/ui/user";
import { UsersIcon } from "@/components/ui/users";
import { MapPinIcon } from "@/components/ui/map-pin";

// Tüm pqoqubbw icon'ları aynı handle ve API'ye sahip — birini referans alabiliriz.
export type AnimatedIconHandle = LayersIconHandle;

export type AnimatedIconComponent = React.ForwardRefExoticComponent<
  React.HTMLAttributes<HTMLDivElement> &
    React.RefAttributes<AnimatedIconHandle> & { size?: number }
>;

export const iconRegistry = {
  archive: ArchiveIcon,
  "map-pin": MapPinIcon,
  "badge-alert": BadgeAlertIcon,
  bell: BellIcon,
  search: SearchIcon,
  zap: ZapIcon,
  sparkles: SparklesIcon,
  blocks: BlocksIcon,
  "book-text": BookTextIcon,
  terminal: TerminalIcon,
  bookmark: BookmarkIcon,
  "bookmark-plus": BookmarkPlusIcon,
  "briefcase-business": BriefcaseBusinessIcon,
  "calendar-days": CalendarDaysIcon,
  "chart-bar-increasing": ChartBarIncreasingIcon,
  "chart-pie": ChartPieIcon,
  "chevron-down": ChevronDownIcon,
  "circle-check": CircleCheckIcon,
  "circle-dollar-sign": CircleDollarSignIcon,
  "circle-dashed": CircleDashedIcon,
  clock: ClockIcon,
  coffee: CoffeeIcon,
  construction: ConstructionIcon,
  "file-text": FileTextIcon,
  "graduation-cap": GraduationCapIcon,
  home: HomeIcon,
  layers: LayersIcon,
  mailbox: MailboxIcon,
  moon: MoonIcon,
  "monitor-check": MonitorCheckIcon,
  "message-square": MessageSquareIcon,
  phone: PhoneIcon,
  plus: PlusIcon,
  receipt: ReceiptIcon,
  settings: SettingsIcon,
  "square-pen": SquarePenIcon,
  pause: PauseIcon,
  play: PlayIcon,
  delete: DeleteIcon,
  sun: SunIcon,
  sunset: SunsetIcon,
  "shield-check": ShieldCheckIcon,
  "lock-keyhole": LockKeyholeIcon,
  "trending-up": TrendingUpIcon,
  user: UserIcon,
  users: UsersIcon,
} as const satisfies Record<string, AnimatedIconComponent>;

export type IconName = keyof typeof iconRegistry;
