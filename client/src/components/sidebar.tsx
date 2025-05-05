import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import React from "react";
import {
  Home,
  Tag,
  Users,
  ClipboardList,
  Settings,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

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

export function Sidebar({ user, onLogout, isMobileOpen, onMobileClose }: SidebarProps) {
  const [location] = useLocation();
  const [selectedOrgId, setSelectedOrgId] = useState<string>(
    user.organizationId ? String(user.organizationId) : ""
  );

  const { data: organizations = [] } = useQuery({
    queryKey: ['/api/organizations'],
    enabled: user.role === 'administrator',
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
      name: "Settings",
      href: "/settings",
      icon: <Settings className="mr-3 h-6 w-6" />,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-0 flex-1 bg-white border-r border-gray-200">
      {/* Logo and app name */}
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-primary-500">
        <div className="badge-circle w-8 h-8 bg-white text-primary-500 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <span className="ml-2 text-white font-semibold text-lg">MeritMark</span>
      </div>
      
      {/* Organization selector */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-200">
        <div className="relative">
          <Select value={selectedOrgId} onValueChange={handleOrganizationChange}>
            <SelectTrigger className="w-full bg-gray-100 hover:bg-gray-200 focus:ring-0">
              <SelectValue placeholder="Select Organization" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org: any) => (
                <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
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
      <nav className="flex-1 px-2 py-4 bg-white space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            onClick={onMobileClose}
            className={cn(
              location === item.href
                ? "bg-gray-100 text-primary-600"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
            )}
          >
            {React.cloneElement(item.icon, {
              className: cn(
                location === item.href
                  ? "text-primary-600"
                  : "text-gray-400 group-hover:text-gray-500",
                "mr-3 h-6 w-6"
              ),
            })}
            {item.name}
          </Link>
        ))}
      </nav>
      
      {/* User profile */}
      <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
        <div className="flex-shrink-0 w-full group block">
          <div className="flex items-center">
            <div>
              <Avatar>
                <AvatarFallback>
                  {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                {user.name}
              </p>
              <button 
                onClick={onLogout} 
                className="text-xs font-medium text-gray-500 group-hover:text-gray-700 hover:underline"
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
          className="lg:hidden fixed inset-0 bg-gray-600 bg-opacity-75 z-20"
          onClick={onMobileClose}
        ></div>
      )}
      
      {/* Mobile sidebar */}
      <div 
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 flex flex-col w-64 z-30 transition-transform transform duration-300 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </div>
      
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-64">
          {sidebarContent}
        </div>
      </aside>
    </>
  );
}
