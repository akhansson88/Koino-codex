import { BodyText, BottomSheet, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";

export function VisibilityConfirmSheet({
  visible,
  comments,
  likes,
  checkIn = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  comments: number;
  likes: number;
  checkIn?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <BottomSheet
      title={t(checkIn ? "community.visibility.makeCheckInPrivateTitle" : "community.visibility.makePrivateTitle")}
      visible={visible}
      onClose={onCancel}
    >
      <BodyText muted>
        {t("community.visibility.engagementWarning", { comments, likes })}
      </BodyText>
      <PrimaryButton disabled={busy} icon="lock" onPress={onConfirm}>
        {t("community.visibility.makePrivate")}
      </PrimaryButton>
      <SecondaryButton disabled={busy} onPress={onCancel}>{t("common.cancel")}</SecondaryButton>
    </BottomSheet>
  );
}
