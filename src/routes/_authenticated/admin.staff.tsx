import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStaff, setAdminRole, setStaffActive } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: AdminStaff,
});

function AdminStaff() {
  const fetch = useServerFn(listStaff);
  const setRole = useServerFn(setAdminRole);
  const setActive = useServerFn(setStaffActive);
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
