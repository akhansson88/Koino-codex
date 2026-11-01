import { useRef, useState } from "react";
import { Pressable } from "react-native";
import { encryptedOperation } from "@/state/encryption/session";
import { useKoinoFields } from "@/state/koino-store";
import { BodyText, BottomSheet, IconButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import { colors } from "@/ui/theme";

// Shared content only. Author self-delete remains in the existing controls.
export function CommunityRemovalMenu({ groupId, targetType, targetId, authorId }: {
  groupId: string; targetType: "post" | "check_in" | "reply"; targetId: string; authorId: string;
}) {
  const { currentUserId, currentGroupId, groups } = useKoinoFields(["currentUserId", "currentGroupId", "groups"]);
  const { t } = useAppTranslation();
  const pending = useRef(false);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const eligible = currentGroupId === groupId && authorId !== currentUserId && groups.some(group => group.id === groupId && group.ownerId === currentUserId && !group.migrationPending);
  if (!eligible) return null;
  return <Pressable accessible={false} onPress={event => event.stopPropagation()} onPressIn={event => event.stopPropagation()}>
    <IconButton accessibilityLabel={t("community.moderation.options")} icon="more-horizontal" onPress={() => { setError(false); setVisible(true); }} />
    <BottomSheet title={t("community.moderation.options")} visible={visible} onClose={() => { if (!saving) setVisible(false); }}>
      {error ? <BodyText style={{ color: colors.danger }}>{t("community.moderation.failed")}</BodyText> : null}
      <SecondaryButton disabled={saving} icon="trash-2" tone="danger" onPress={() => {
        confirmAction({ title: t("community.moderation.remove"), message: t("community.moderation.confirm"),
          confirmText: t("community.moderation.remove"), cancelText: t("common.cancel"), destructive: true,
          onConfirm: () => {
            if (pending.current) return;
            pending.current = true;
            setSaving(true); setError(false);
            void encryptedOperation("removeCommunityContent", { groupId, targetType, targetId })
              .then(() => setVisible(false)).catch(() => setError(true)).finally(() => { pending.current = false; setSaving(false); });
          },
        });
      }}>{t(saving ? "community.moderation.removing" : "community.moderation.remove")}</SecondaryButton>
    </BottomSheet>
  </Pressable>;
}
