import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  beforeLoad: () => {
    throw redirect({
      to: "/admin/team",
      search: { tab: "staff" },
    });
  },
  component: () => null,
});
