import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiPrefix } from "@/lib/queryClient";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateBadgeIcon } from "@/lib/badge-icons";
import type { BadgeWithExtras } from "@/types/badge";

interface AwardBadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge: Pick<
    BadgeWithExtras,
    "id" | "name" | "description" | "color" | "imageUrl"
  >;
  organizationId: number;
}

const formSchema = z.object({
  userId: z.coerce.number({
    required_error: "Please select a user",
    invalid_type_error: "Please select a user",
  }),
});

export function AwardBadgeDialog({
  open,
  onOpenChange,
  badge,
  organizationId,
}: AwardBadgeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: [`${apiPrefix}/organizations/${organizationId}/users`],
    enabled: !!organizationId && open,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: undefined,
    },
  });

  const awardBadgeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest(
        "POST",
        `${apiPrefix}/badges/${badge.id}/award`,
        values,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Badge awarded",
        description: "The badge has been awarded successfully.",
      });
      queryClient.invalidateQueries({
        queryKey: [
          `${apiPrefix}/organizations/${organizationId}/awarded-badges`,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [`${apiPrefix}/organizations/${organizationId}/stats`],
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description:
          error.message || "Failed to award badge. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    awardBadgeMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Award Badge</DialogTitle>
              <DialogDescription>
                Grant this achievement to a user in your organization.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center text-center space-y-3 py-2">
              <div
                className="badge-circle w-20 h-20 mb-2 flex items-center justify-center"
                style={{
                  backgroundColor: `${badge.color}10`,
                  color: badge.color || "#4F46E5",
                }}
              >
                {badge.imageUrl ? (
                  <img
                    src={badge.imageUrl}
                    alt={badge.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  generateBadgeIcon(badge.name, badge.color || "#4F46E5")
                )}
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                {badge.name}
              </h3>
              <p className="text-sm text-gray-500">{badge.description}</p>
            </div>

            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select User</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(Number(value))}
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user to award this badge" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map((user: any) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                disabled={awardBadgeMutation.isPending}
              >
                {awardBadgeMutation.isPending ? "Awarding..." : "Award Badge"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
