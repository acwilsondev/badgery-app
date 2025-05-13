import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { Link } from "wouter";
import { Menu, Search, Plus, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface UsersProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
}

export default function Users({ user, onLogout }: UsersProps) {
  const organizationId = user.organizationId || 1;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: [`/api/organizations/${organizationId}/users`],
  });

  const filteredUsers = users.filter((user: any) => {
    return searchQuery
      ? user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
  });

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar 
        user={user} 
        onLogout={onLogout} 
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      
      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Top navigation */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/20">
          <button
            type="button"
            className="lg:hidden px-4 border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 dark:focus:ring-primary-400"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" />
          </button>
        </div>
        
        {/* Page header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-700/20">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Users</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage users and assign badges</p>
          </div>
        </header>
        
        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none dark:bg-gray-900">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Search and actions section */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
                <div className="relative w-full sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <Input
                    type="search"
                    placeholder="Search users..."
                    className="pl-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <Button className="bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>
              
              {/* Users table */}
              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/20 overflow-hidden rounded-lg">
                {isLoading ? (
                  <div className="p-6 text-center dark:text-gray-300">Loading users...</div>
                ) : filteredUsers.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-gray-50 dark:bg-gray-900">
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="text-gray-900 dark:text-gray-300">Name</TableHead>
                        <TableHead className="text-gray-900 dark:text-gray-300">Username</TableHead>
                        <TableHead className="text-gray-900 dark:text-gray-300">Email</TableHead>
                        <TableHead className="text-gray-900 dark:text-gray-300">Role</TableHead>
                        <TableHead className="text-gray-900 dark:text-gray-300 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user: any) => (
                        <TableRow key={user.id} className="border-b border-gray-200 dark:border-gray-700">
                          <TableCell className="flex items-center space-x-3 text-gray-900 dark:text-gray-300">
                            <Avatar>
                              <AvatarFallback className="bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-300">{getInitials(user.name)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{user.name}</span>
                          </TableCell>
                          <TableCell className="text-gray-900 dark:text-gray-300">{user.username}</TableCell>
                          <TableCell className="text-gray-900 dark:text-gray-300">{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600">
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                                <DropdownMenuItem asChild className="dark:text-gray-300 dark:focus:bg-gray-700">
                                  <Link to={`/users/${user.id}`}>
                                    View Profile
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="dark:text-gray-300 dark:focus:bg-gray-700">Award Badge</DropdownMenuItem>
                                <DropdownMenuItem className="dark:text-gray-300 dark:focus:bg-gray-700">Edit User</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No users found. Try adjusting your search or add a new user.
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
