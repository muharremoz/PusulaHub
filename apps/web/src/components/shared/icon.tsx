"use client";

import { forwardRef } from "react";
import {
  iconRegistry,
  type AnimatedIconHandle,
  type IconName,
} from "./icon-registry";

interface IconProps extends React.HTMLAttributes<HTMLDivElement> {
  name: IconName;
  /** Piksel cinsinden boyut. Default 18. */
  size?: number;
}

/**
 * Tek tip icon component'i — `lucide-animated.com` (pqoqubbw) kütüphanesinden.
 * Tüm icon'lar hover'da otomatik animasyon tetikler. Padding alanından
 * tetikleme istiyorsan parent'a `onMouseEnter`/`onMouseLeave` koy ve ref ile
 * `iconRef.current?.startAnimation()` çağır.
 *
 * Kullanım:
 *   <Icon name="layers" size={24} />
 *   <Icon name="users" ref={iconRef} />
 */
export const Icon = forwardRef<AnimatedIconHandle, IconProps>(
  ({ name, size = 18, ...props }, ref) => {
    const Component = iconRegistry[name];
    return <Component ref={ref} size={size} {...props} />;
  },
);
Icon.displayName = "Icon";
