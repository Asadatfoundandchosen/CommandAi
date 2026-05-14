import { useLocation, useNavigate } from 'react-router-dom';
import Wordmark from './Wordmark';
import {
  BarChart3,
  Building2,
  Target,
  Bot,
  Users,
  FileText,
  Settings,
  Zap,
  GraduationCap,
  TrendingUp,
  HelpCircle,
  ChevronDown,
  Shield,
  Database,
  Store,
  DollarSign,
  Activity,
  UserCog,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useActionQueueStore } from '@/store/actionQueueStore';
import { UserRole } from '@/types';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  badge?: number;
}

const superAdminPrimary: NavItem[] = [
  { label: 'Platform Admin', path: '/super-admin', icon: Shield },
];

const superAdminOps: NavItem[] = [
  { label: 'Orgs and Accounts', path: '/orgs-accounts', icon: Building2 },
  { label: 'Marketplace', path: '/marketplace', icon: Store },
  { label: 'Billing and Revenue', path: '/billing-revenue', icon: DollarSign },
  { label: 'Platform Health', path: '/platform-health', icon: Activity },
  { label: 'Team Management', path: '/team-management', icon: UserCog },
];

const superAdminCustomerView: NavItem[] = [];

const orgNav: NavItem[] = [
  { label: 'Portfolio Overview', path: '/portfolio', icon: BarChart3 },
  { label: 'Accounts', path: '/accounts', icon: Building2 },
  { label: 'OKR Reporting', path: '/okr-reporting', icon: Target },
];

const accountNav: NavItem[] = [
  { label: 'Agent Registry', path: '/agent-registry', icon: Bot },
  { label: 'Data Center', path: '/data-center', icon: Database },
  { label: 'Training Room', path: '/training-room', icon: GraduationCap },
  { label: 'OKR Management', path: '/okr-management', icon: Target },
  { label: 'HITL Management', path: '/hitl-management', icon: Users },
  { label: 'Audit Log', path: '/audit-log', icon: FileText },
  { label: 'Settings', path: '/settings', icon: Settings },
];

const Sidebar = () => {
  const { user } = useAuthStore();
  const pendingCount = useActionQueueStore((s) => s.actions.filter((a) => a.status === 'Pending').length);
  const location = useLocation();
  const navigate = useNavigate();
  const [contextOpen, setContextOpen] = useState(false);

  if (!user) return null;

  const deptNav: NavItem[] = [
    { label: 'Action Queue', path: '/action-queue', icon: Zap, badge: pendingCount },
    { label: 'My Agents', path: '/my-agents', icon: Bot },
    { label: 'Training Room', path: '/dept-training', icon: GraduationCap },
    { label: 'My Performance', path: '/my-performance', icon: TrendingUp },
  ];

  // Build super admin nav with sections
  type NavSection = { items: NavItem[]; label?: string };
  let sections: NavSection[] = [];

  if (user.role === UserRole.SUPER_ADMIN) {
    sections = [
      { items: superAdminPrimary },
      { items: superAdminOps },
    ];
  } else {
    const navItems: Record<string, NavItem[]> = {
      [UserRole.ORG]: orgNav,
      [UserRole.ACCOUNT]: accountNav,
      [UserRole.DEPARTMENT]: deptNav,
    };
    sections = [{ items: navItems[user.role] || [] }];
  }

  return (
    <aside className="w-60 min-w-[240px] max-w-[240px] bg-shell-bg border-r border-shell-border flex flex-col shrink-0 h-full">
      {/* Context switcher */}
      <div className="p-4 border-b border-shell-border">
        <button
          onClick={() => setContextOpen(!contextOpen)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            {user.role === UserRole.SUPER_ADMIN ? (
              <Wordmark size="sm" />
            ) : (
              <>
                <div className="text-body text-shell-text">{user.orgName}</div>
                {user.role !== UserRole.ORG && (
                  <div className="text-label text-shell-muted">{user.accountName}</div>
                )}
                {user.role === UserRole.DEPARTMENT && (
                  <div className="text-[11px] text-shell-muted">{user.departmentName}</div>
                )}
              </>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-shell-muted transition-transform ${contextOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            {sIdx > 0 && <div className="my-2 mx-3 border-t border-shell-border" />}
            {section.label && (
              <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-shell-muted">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-body transition-colors ${
                    active
                      ? 'text-shell-accent border-l-[3px] border-shell-accent bg-shell-surface'
                      : 'text-shell-muted hover:text-shell-text hover:bg-shell-surface'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="min-w-[20px] h-5 rounded-full bg-shell-accent text-shell-bg text-[11px] flex items-center justify-center px-1.5">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-shell-border space-y-2">
        <button className="flex items-center gap-2 text-body text-shell-muted hover:text-shell-text transition-colors">
          <HelpCircle className="w-4 h-4" />
          <span>Help</span>
        </button>
        <div className="text-[11px] text-shell-muted">v0.1.0</div>
      </div>
    </aside>
  );
};

export default Sidebar;
