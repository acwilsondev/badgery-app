import React from "react";
import { Sidebar } from "@/components/sidebar";
import { Button as _Button } from "@/components/ui/button";
import {
  Card as _Card,
  CardContent as _CardContent,
  CardDescription as _CardDescription,
  CardFooter as _CardFooter,
  CardHeader as _CardHeader,
  CardTitle as _CardTitle,
} from "@/components/ui/card";
import {
  BrandButton,
  BrandHeading,
  BrandCard,
  BrandBadge,
} from "@/components/ui/brand-elements";
import TestColors from "@/components/test-colors";
import {
  Award,
  CheckCircle,
  ChevronRight,
  Flag,
  Lightbulb,
  User,
  Users,
} from "lucide-react";

interface BrandingProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
}

export default function Branding({ user, onLogout }: BrandingProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Header section */}
              <div className="mb-8">
                <BrandHeading level={1} gradient={true}>
                  Brand Elements
                </BrandHeading>
                <p className="text-muted-foreground mt-2">
                  A showcase of our design system components using the new color
                  palette.
                </p>
              </div>

              {/* Test Colors Component */}
              <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4">Color Test Component</h2>
                <TestColors />
              </div>

              {/* Color palette section */}
              <section className="mb-12">
                <BrandHeading level={2} className="mb-4">
                  Color Palette
                </BrandHeading>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="flex flex-col">
                    <div className="h-24 rounded-md bg-brand-purple flex items-end p-2">
                      <span className="text-white text-xs font-medium">
                        Deep Purple
                      </span>
                    </div>
                    <span className="text-sm mt-1 text-foreground">
                      #5E2B97
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Primary
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="h-24 rounded-md bg-brand-orange flex items-end p-2">
                      <span className="text-white text-xs font-medium">
                        Vibrant Orange
                      </span>
                    </div>
                    <span className="text-sm mt-1 text-foreground">
                      #F76C1F
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Accent
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="h-24 rounded-md bg-brand-lilac flex items-end p-2">
                      <span className="text-brand-charcoal text-xs font-medium">
                        Soft Lilac
                      </span>
                    </div>
                    <span className="text-sm mt-1 text-foreground">
                      #BFA5E0
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Supportive
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="h-24 rounded-md bg-brand-coral flex items-end p-2">
                      <span className="text-brand-charcoal text-xs font-medium">
                        Bright Coral
                      </span>
                    </div>
                    <span className="text-sm mt-1 text-foreground">
                      #FF9C6E
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Secondary
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="h-24 rounded-md bg-brand-charcoal flex items-end p-2">
                      <span className="text-white text-xs font-medium">
                        Charcoal Gray
                      </span>
                    </div>
                    <span className="text-sm mt-1 text-foreground">
                      #2E2E2E
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Neutral
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="h-24 rounded-md bg-brand-gray flex items-end p-2">
                      <span className="text-brand-charcoal text-xs font-medium">
                        Light Cool Gray
                      </span>
                    </div>
                    <span className="text-sm mt-1 text-foreground">
                      #F2F2F5
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Background
                    </span>
                  </div>
                </div>
              </section>

              {/* Typography section */}
              <section className="mb-12">
                <BrandHeading level={2} className="mb-4">
                  Typography
                </BrandHeading>

                <div className="space-y-8">
                  <div>
                    <BrandHeading level={1}>Heading Level 1</BrandHeading>
                    <p className="text-sm text-muted-foreground mt-1">
                      5xl / Extrabold
                    </p>
                  </div>

                  <div>
                    <BrandHeading level={2}>Heading Level 2</BrandHeading>
                    <p className="text-sm text-muted-foreground mt-1">
                      3xl / Bold
                    </p>
                  </div>

                  <div>
                    <BrandHeading level={3}>Heading Level 3</BrandHeading>
                    <p className="text-sm text-muted-foreground mt-1">
                      2xl / Bold
                    </p>
                  </div>

                  <div>
                    <BrandHeading level={4}>Heading Level 4</BrandHeading>
                    <p className="text-sm text-muted-foreground mt-1">
                      xl / Semibold
                    </p>
                  </div>

                  <div>
                    <BrandHeading level={1} gradient={true}>
                      Gradient Heading
                    </BrandHeading>
                    <p className="text-sm text-muted-foreground mt-1">
                      With purple to lilac gradient effect
                    </p>
                  </div>
                </div>
              </section>

              {/* Buttons section */}
              <section className="mb-12">
                <BrandHeading level={2} className="mb-4">
                  Buttons
                </BrandHeading>

                <div className="flex flex-wrap gap-4 mb-8">
                  <BrandButton variant="default">Primary Button</BrandButton>
                  <BrandButton variant="secondary">
                    Secondary Button
                  </BrandButton>
                  <BrandButton variant="accent">Accent Button</BrandButton>
                  <BrandButton variant="outline">Outline Button</BrandButton>
                  <BrandButton variant="ghost">Ghost Button</BrandButton>
                  <BrandButton variant="link">Link Button</BrandButton>
                </div>

                <div className="flex flex-wrap gap-4">
                  <BrandButton variant="gradient">
                    <span>Gradient Button</span>
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </BrandButton>

                  <BrandButton variant="default" size="sm">
                    Small Button
                  </BrandButton>
                  <BrandButton variant="default" size="lg">
                    Large Button
                  </BrandButton>

                  <BrandButton variant="default" size="icon">
                    <Award className="h-5 w-5" />
                  </BrandButton>

                  <BrandButton variant="gradient" size="icon">
                    <Users className="h-5 w-5" />
                  </BrandButton>
                </div>
              </section>

              {/* Cards section */}
              <section className="mb-12">
                <BrandHeading level={2} className="mb-4">
                  Cards
                </BrandHeading>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <BrandCard className="p-6">
                    <BrandHeading level={3}>Standard Card</BrandHeading>
                    <p className="mt-2 text-muted-foreground">
                      This is a simple card with clean styling.
                    </p>
                    <div className="mt-4">
                      <BrandButton variant="default">Action</BrandButton>
                    </div>
                  </BrandCard>

                  <BrandCard bordered={true} className="p-6">
                    <BrandHeading level={3}>Bordered Card</BrandHeading>
                    <p className="mt-2 text-muted-foreground">
                      This card has a subtle border to define its edges.
                    </p>
                    <div className="mt-4">
                      <BrandButton variant="outline">Action</BrandButton>
                    </div>
                  </BrandCard>

                  <BrandCard gradient={true} className="p-6">
                    <BrandHeading level={3}>Gradient Card</BrandHeading>
                    <p className="mt-2 text-muted-foreground">
                      This card has a subtle gradient background.
                    </p>
                    <div className="mt-4">
                      <BrandButton variant="gradient">Action</BrandButton>
                    </div>
                  </BrandCard>

                  {/* Feature card example */}
                  <BrandCard
                    bordered={true}
                    className="p-6 col-span-1 md:col-span-3"
                  >
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <div className="h-12 w-12 rounded-full bg-brand-purple/10 flex items-center justify-center mb-4">
                          <Lightbulb className="h-6 w-6 text-brand-purple" />
                        </div>
                        <BrandHeading level={3}>
                          Feature Card Example
                        </BrandHeading>
                        <p className="mt-2 text-muted-foreground">
                          This is an example of how these components can be
                          combined to create feature cards or highlight
                          important information.
                        </p>
                        <div className="mt-6 flex space-x-3">
                          <BrandBadge variant="purple">Feature</BrandBadge>
                          <BrandBadge variant="orange">New</BrandBadge>
                        </div>
                      </div>

                      <div className="flex flex-col justify-end">
                        <BrandButton variant="gradient">
                          Get Started
                        </BrandButton>
                      </div>
                    </div>
                  </BrandCard>
                </div>
              </section>

              {/* Badges section */}
              <section className="mb-12">
                <BrandHeading level={2} className="mb-4">
                  Badges
                </BrandHeading>

                <div className="flex flex-wrap gap-4 mb-8">
                  <BrandBadge variant="purple">Purple Badge</BrandBadge>
                  <BrandBadge variant="lilac">Lilac Badge</BrandBadge>
                  <BrandBadge variant="orange">Orange Badge</BrandBadge>
                  <BrandBadge variant="coral">Coral Badge</BrandBadge>
                </div>

                <div className="flex flex-wrap gap-4">
                  <BrandBadge variant="purple" size="sm">
                    Small
                  </BrandBadge>
                  <BrandBadge variant="lilac" size="md">
                    Medium
                  </BrandBadge>
                  <BrandBadge variant="orange" size="lg">
                    Large
                  </BrandBadge>

                  <BrandBadge variant="purple">
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    <span>With Icon</span>
                  </BrandBadge>

                  <BrandBadge variant="orange">
                    <Flag className="h-3.5 w-3.5 mr-1" />
                    <span>Priority</span>
                  </BrandBadge>

                  <BrandBadge variant="lilac">
                    <User className="h-3.5 w-3.5 mr-1" />
                    <span>Assigned</span>
                  </BrandBadge>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
