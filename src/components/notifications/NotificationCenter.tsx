import { useState } from 'react';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { NotificationPreferencesPanel } from '@/components/notifications/NotificationPreferencesPanel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/store/slices/notificationsSlice';
import type { AppNotification } from '@/types/notifications';

function NotificationRow({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
        !item.read && 'bg-accent/40',
      )}
    >
      <div className="font-medium leading-tight">{item.title}</div>
      <div className="text-xs text-muted-foreground line-clamp-2">{item.message}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {new Date(item.createdAt).toLocaleString()}
      </div>
    </button>
  );
}

export function NotificationCenter() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.notifications.items);
  const unread = items.filter((n) => !n.read).length;
  const [showPrefs, setShowPrefs] = useState(false);

  const openItem = (item: AppNotification) => {
    dispatch(markNotificationRead(item.id));
    if (item.url) {
      navigate(item.url);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unread > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => dispatch(markAllNotificationsRead())}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          ) : null}
        </DropdownMenuLabel>
        {showPrefs ? (
          <NotificationPreferencesPanel onClose={() => setShowPrefs(false)} />
        ) : (
          <>
            <DropdownMenuSeparator />
            <div className="max-h-72 overflow-y-auto p-1">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No notifications yet
                </p>
              ) : (
                items.slice(0, 20).map((item) => (
                  <NotificationRow key={item.id} item={item} onOpen={openItem} />
                ))
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setShowPrefs(true)}
              >
                <Settings className="h-4 w-4" />
                Preferences
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
