import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import React from "react";
import {
  Home,
  Tag,
  Users,
  ClipboardList,
  Settings,
  BarChart2,
  Palette,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiPrefix } from "@/lib/queryClient";

interface Organization {
  id: number;
  name: string;
  description?: string;
}

interface SidebarProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  user,
  onLogout,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const [location] = useLocation();
  const [selectedOrgId, setSelectedOrgId] = useState<string>(
    user.organizationId ? String(user.organizationId) : "",
  );

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: [`${apiPrefix}/organizations`],
    enabled: user.role === "administrator",
  });

  useEffect(() => {
    if (user.organizationId && !selectedOrgId) {
      setSelectedOrgId(String(user.organizationId));
    }
  }, [user.organizationId, selectedOrgId]);

  const handleOrganizationChange = (value: string) => {
    setSelectedOrgId(value);
    // In a real app, you would update the user's current organization
  };

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: <Home className="mr-3 h-6 w-6" />,
    },
    {
      name: "Badges",
      href: "/badges",
      icon: <Tag className="mr-3 h-6 w-6" />,
    },
    {
      name: "Progress",
      href: "/progress",
      icon: <BarChart2 className="mr-3 h-6 w-6" />,
    },
    {
      name: "Users",
      href: "/users",
      icon: <Users className="mr-3 h-6 w-6" />,
    },
    {
      name: "Reports",
      href: "/reports",
      icon: <ClipboardList className="mr-3 h-6 w-6" />,
    },
    {
      name: "Branding",
      href: "/branding",
      icon: <Palette className="mr-3 h-6 w-6" />,
    },
    {
      name: "Settings",
      href: "/settings",
      icon: <Settings className="mr-3 h-6 w-6" />,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-0 flex-1 bg-card border-r border-border">
      {/* Logo and app name */}
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-gradient-to-r from-brand-purple to-brand-lilac">
        <div className="badge-circle w-8 h-8 bg-white/90 text-brand-purple flex items-center justify-center rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <span className="ml-2 text-white font-semibold text-lg">MeritMark</span>
      </div>

      {/* Organization selector */}
      <div className="px-4 pt-5 pb-4 border-b border-border">
        <div className="relative">
          <Select
            value={selectedOrgId}
            onValueChange={handleOrganizationChange}
          >
            <SelectTrigger className="w-full bg-muted hover:bg-muted/80 focus:ring-1 focus:ring-brand-purple/30 border-border">
              <SelectValue placeholder="Select Organization" />
            </SelectTrigger>
            <SelectContent className="border-border">
              {organizations.map((org: Organization) => (
                <SelectItem key={org.id} value={String(org.id)}>
                  {org.name}
                </SelectItem>
              ))}
              {organizations.length === 0 && (
                <SelectItem value={selectedOrgId || "default"}>
                  {user.organizationId ? "Acme Inc." : "No Organizations"}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-2 py-4 bg-card space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            onClick={onMobileClose}
            className={cn(
              location === item.href
                ? "bg-brand-purple/10 text-brand-purple"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
            )}
          >
            {React.cloneElement(item.icon, {
              className: cn(
                location === item.href
                  ? "text-brand-purple"
                  : "text-muted-foreground group-hover:text-foreground",
                "mr-3 h-5 w-5",
              ),
            })}
            {item.name}
          </Link>
        ))}
      </nav>

      {/* User profile and theme toggle */}
      <div className="flex-shrink-0 border-t border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Appearance</div>
          <ThemeToggle />
        </div>

        <div className="flex-shrink-0 w-full group block pt-3 border-t border-border">
          <div className="flex items-center">
            <div>
              <Avatar>
                <AvatarFallback className="bg-brand-purple/10 text-brand-purple">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{user.name}</p>
              <button
                onClick={onLogout}
                className="text-xs font-medium text-muted-foreground hover:text-brand-purple hover:underline transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-20"
          onClick={onMobileClose}
        ></div>
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 flex flex-col w-72 z-30 transition-transform transform duration-300 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-64">{sidebarContent}</div>
      </aside>
    </>
  );
}
