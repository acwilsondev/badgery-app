import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { Link } from "wouter";
import { apiPrefix } from "@/lib/queryClient";
import { Menu, Search, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
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

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: [`${apiPrefix}/organizations/${organizationId}/users`],
  });

  const filteredUsers = Array.isArray(users)
    ? users.filter((user: any) => {
        return searchQuery
          ? user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.username.toLowerCase().includes(searchQuery.toLowerCase())
          : true;
      })
    : [];

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        user={user}
        onLogout={onLogout}
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Mobile menu button - only visible on mobile */}
        <button
          type="button"
          className="lg:hidden absolute left-0 top-0 z-50 px-4 h-16 border-r border-border text-brand-purple hover:text-brand-purple/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-purple/50 transition-colors"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Menu className="h-6 w-6" />
        </button>

        {/* Standardized Page Header */}
        <PageHeader
          title="Users"
          description="Manage users and assign badges"
          showSearch={true}
          searchPlaceholder="Search users..."
          onSearchChange={setSearchQuery}
          actionButton={{
            label: "Add User",
            onClick: () => console.log("Add user clicked"),
            icon: <Plus className="h-4 w-4 mr-1" />,
          }}
        />

        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none bg-background">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Spacer to replace the search and action buttons (now in header) */}
              <div className="mb-6"></div>

              {/* Users table */}
              <div className="bg-card border border-border shadow-sm overflow-hidden rounded-lg">
                {isLoading ? (
                  <div className="p-8 text-center">
                    <div className="flex justify-center mb-4">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-purple/20 border-t-brand-purple" />
                    </div>
                    <p className="text-muted-foreground">Loading users...</p>
                  </div>
                ) : filteredUsers.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="border-b border-border hover:bg-transparent">
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user: any) => (
                        <TableRow
                          key={user.id}
                          className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                        >
                          <TableCell className="flex items-center space-x-3">
                            <Avatar>
                              <AvatarFallback className="bg-brand-purple/10 text-brand-purple">
                                {getInitials(user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{user.name}</span>
                          </TableCell>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="capitalize border-brand-purple/30 text-brand-purple"
                            >
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="border-border"
                              >
                                <DropdownMenuItem asChild>
                                  <Link
                                    to={`/users/${user.id}`}
                                    className="cursor-pointer"
                                  >
                                    View Profile
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer">
                                  Award Badge
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer">
                                  Edit User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center">
                    <div className="mb-4">
                      <div className="h-16 w-16 mx-auto bg-brand-purple/10 rounded-full flex items-center justify-center">
                        <Search className="h-8 w-8 text-brand-purple" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold">No users found</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Try adjusting your search or add a new user.
                    </p>
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
