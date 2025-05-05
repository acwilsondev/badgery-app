import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, BadgeCategory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface BadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: Badge;
  organizationId: number;
}

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  criteria: z.string().optional(),
  imageUrl: z.string().optional(),
  color: z.string().optional(),
  categoryId: z.coerce.number().optional(),
});

export function BadgeDialog({ open, onOpenChange, badge, organizationId }: BadgeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: categories = [] } = useQuery<BadgeCategory[]>({
    queryKey: [`/api/organizations/${organizationId}/categories`],
    enabled: !!organizationId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: badge?.name || "",
      description: badge?.description || "",
      criteria: badge?.criteria || "",
      imageUrl: badge?.imageUrl || "",
      color: badge?.color || "#4F46E5",
      categoryId: badge?.categoryId || undefined,
    },
  });

  const createBadgeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest(
        "POST", 
        `/api/organizations/${organizationId}/badges`, 
        values
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Badge created",
        description: "Your badge has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/badges`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/stats`] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create badge. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBadgeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest("PUT", `/api/badges/${badge?.id}`, values);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Badge updated",
        description: "Your badge has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/badges`] });
      queryClient.invalidateQueries({ queryKey: [`/api/badges/${badge?.id}`] });
      onOpenChange(false);
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update badge. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (badge) {
      updateBadgeMutation.mutate(values);
    } else {
      createBadgeMutation.mutate(values);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {badge ? "Edit Badge" : "Create New Badge"}
              </DialogTitle>
              <DialogDescription>
                {badge
                  ? "Update the badge details below."
                  : "Fill in the details below to create a new badge for your organization."}
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Badge Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Innovation Champion"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what this badge represents"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(Number(value))}
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id.toString()}
                        >
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Badge Color</FormLabel>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-10 h-10 rounded cursor-pointer"
                      {...field}
                    />
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/image.jpg"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="criteria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Criteria for Earning</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List the specific requirements for earning this badge"
                      rows={3}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700"
                disabled={createBadgeMutation.isPending || updateBadgeMutation.isPending}
              >
                {createBadgeMutation.isPending || updateBadgeMutation.isPending ? (
                  "Saving..."
                ) : badge ? (
                  "Update Badge"
                ) : (
                  "Create Badge"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
