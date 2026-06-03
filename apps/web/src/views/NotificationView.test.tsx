import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationView } from "./NotificationView";
import type { HonninNotification, NotifyRegistration, Resident } from "../types";

const baseResident: Resident = {
  residentId: "R-001",
  householdId: "H-001",
  familyNameKanji: "鈴木",
  givenNameKanji: "花子",
  familyNameKana: "スズキ",
  givenNameKana: "ハナコ",
  birthDate: "1990-01-01",
  sex: "F",
  addressCode: "132010001001",
  addressText: "東京都サンプル市1-1",
  relationToHead: "本人",
  movedInDate: "2020-04-01",
  movedOutDate: null,
  juminCode: "**** **** ***",
  myNumber: "**** **** ****",
  nationality: null,
  alias: [],
  restrictions: [],
  validFrom: "2020-04-01T00:00:00+09:00",
  validTo: null,
};

const reg: NotifyRegistration = {
  registrationId: "HT-1",
  residentId: "R-001",
  registeredAt: "2026-06-03T09:00:00.000Z",
  expiresAt: "2029-06-03",
  status: "ACTIVE",
};

const notification: HonninNotification = {
  notificationId: "NT-1",
  residentId: "R-001",
  issueId: "CI-1",
  formId: "0010001",
  requesterType: "THIRD_PARTY",
  certifiedAt: "2026-06-03T09:10:00.000Z",
  notifiedAt: "2026-06-03T09:10:01.000Z",
  channel: "POSTAL",
  status: "NOTIFIED",
};

describe("NotificationView (SCR-801 本人通知制度)", () => {
  it("住民未選択なら登録フォームの代わりにガイドを表示", async () => {
    render(
      <NotificationView
        resident={null}
        loadRegistrations={vi.fn().mockResolvedValue([])}
        loadNotifications={vi.fn().mockResolvedValue([])}
        onRegister={vi.fn()}
        onUnregister={vi.fn()}
      />,
    );
    expect(await screen.findByText(/対象住民を選択してください/)).toBeInTheDocument();
  });

  it("登録中・通知記録を一覧表示し、登録ボタンで onRegister が呼ばれる", async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationView
        resident={baseResident}
        loadRegistrations={vi.fn().mockResolvedValue([reg])}
        loadNotifications={vi.fn().mockResolvedValue([notification])}
        onRegister={onRegister}
        onUnregister={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("HT-1")).toBeInTheDocument());
    expect(screen.getByText("NT-1")).toBeInTheDocument();
    expect(screen.getByText("第三者")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /本人通知制度に登録/ }));
    expect(onRegister).toHaveBeenCalledWith("R-001", "");
  });

  it("廃止ボタンで onUnregister(registrationId) が呼ばれる", async () => {
    const onUnregister = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationView
        resident={baseResident}
        loadRegistrations={vi.fn().mockResolvedValue([reg])}
        loadNotifications={vi.fn().mockResolvedValue([])}
        onRegister={vi.fn()}
        onUnregister={onUnregister}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "廃止" }));
    expect(onUnregister).toHaveBeenCalledWith("HT-1");
  });
});
