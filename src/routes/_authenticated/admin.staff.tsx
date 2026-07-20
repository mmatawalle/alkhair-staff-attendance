import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStaff, setAdminRole, setStaffActive, setStaffWeeklyTarget } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: AdminStaff,
});

function TargetInput({
  userId,
  initial,
  onSave,
  saving,
}: {
  userId: string;
  initial: number;
  onSave: (userId: string, value: number) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState<string>(String(initial ?? 40));
  useEffect(() => {
    setVal(String(initial ?? 40));
  }, [initial]);
  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 168) {
      toast.error("Enter hours between 0 and 168");
      setVal(String(initial ?? 40));
      return;
    }
    if (n === Number(initial)) return;
    onSave(userId, n);
  };
  return (
    <div className="flex items-center gap-1 justify-end">
      <Input
        type="number"
        min={0}
        max={168}
        step={0.5}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={saving}
        className="h-8 w-20 text-right"
      />
      <span className="text-xs text-muted-foreground">h/wk</span>
    </div>
  );
}

function AdminStaff() {
  const fetch = useServerFn(listStaff);
  const setRole = useServerFn(setAdminRole);
  const setActive = useServerFn(setStaffActive);
  const setTarget = useServerFn(setStaffWeeklyTarget);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["staff"], queryFn: () => fetch() });

  const roleM = useMutation({
    mutationFn: (v: { user_id: string; makeAdmin: boolean }) => setRole({ data: v }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activeM = useMutation({
    mutationFn: (v: { user_id: string; active: boolean }) => setActive({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const targetM = useMutation({
    mutationFn: (v: { user_id: string; weekly_target_hours: number }) => setTarget({ data: v }),
    onSuccess: () => {
      toast.success("Weekly target updated");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["team-entries"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Staff</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">All employees</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Weekly target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((u: any) => {
                const isAdmin = u.roles.includes("admin");
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.length === 0 && <Badge variant="outline">none</Badge>}
                      {u.roles.map((r: string) => (
                        <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={isAdmin}
                        onCheckedChange={(v) =>
                          roleM.mutate({ user_id: u.id, makeAdmin: v })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.active}
                        onCheckedChange={(v) =>
                          activeM.mutate({ user_id: u.id, active: v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <TargetInput
                        userId={u.id}
                        initial={Number(u.weekly_target_hours ?? 40)}
                        saving={targetM.isPending}
                        onSave={(user_id, weekly_target_hours) =>
                          targetM.mutate({ user_id, weekly_target_hours })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
