import { useEffect, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Choice, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { confirmAction } from "@/ui/confirm";
import { colors } from "@/ui/theme";

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [currentGroupName, setCurrentGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const resolvedAmount = amount === 0 ? Number(customAmount) : amount;
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const canChangePassword =
    currentPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword && !isChangingPassword;

  useEffect(() => {
    setCurrentGroupName(group?.name ?? "");
  }, [group?.name]);

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card>
          <SectionTitle>Session</SectionTitle>
          <Body>Email: {state.authEmail ?? "Unknown"}</Body>
          <Body>Name: {user?.name ?? "Unknown"}</Body>
          <Body>Current group: {group?.name ?? "No group selected"}</Body>
          <Body muted>{state.groups.length} joined {state.groups.length === 1 ? "group" : "groups"}.</Body>
          <PillButton variant="ghost" onPress={() => dispatch({ type: "signOut" })}>
            Log out
          </PillButton>
        </Card>

        <Card>
          <SectionTitle>Password</SectionTitle>
          <Body muted>Change the password for the account you are currently signed into.</Body>
          <Field
            value={currentPassword}
            onChangeText={(value) => {
              setCurrentPassword(value);
              setPasswordMessage("");
            }}
            placeholder="Current password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Field
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              setPasswordMessage("");
            }}
            placeholder="New password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Field
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setPasswordMessage("");
            }}
            placeholder="Confirm new password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          {newPassword && newPassword.length < 6 ? <Body muted>Use at least 6 characters.</Body> : null}
          {confirmPassword && newPassword !== confirmPassword ? <Body muted>The new passwords do not match.</Body> : null}
          {passwordMessage ? <Body muted>{passwordMessage}</Body> : null}
          {state.authError ? <Body muted>{state.authError}</Body> : null}
          <PillButton
            disabled={!canChangePassword}
            onPress={async () => {
              setIsChangingPassword(true);
              setPasswordMessage("");
              try {
                await dispatch({ type: "changePassword", currentPassword, newPassword });
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setPasswordMessage("Password updated.");
              } catch {
                setPasswordMessage("");
              } finally {
                setIsChangingPassword(false);
              }
            }}
          >
            {isChangingPassword ? "Updating..." : "Update password"}
          </PillButton>
        </Card>

        <Card tone="moss">
          <SectionTitle>Current group</SectionTitle>
          {group ? (
            <>
              <Text selectable style={{ color: colors.olive, fontSize: 18, fontWeight: "900" }}>
                Invite code: {group.inviteCode}
              </Text>
              <Body muted>Share this code manually with people in your small group.</Body>
              <Field value={currentGroupName} onChangeText={setCurrentGroupName} placeholder="Group name" />
              <PillButton
                disabled={!ownsGroup || !currentGroupName.trim() || currentGroupName.trim() === group.name}
                onPress={() => dispatch({ type: "updateGroup", id: group.id, name: currentGroupName })}
              >
                Save group name
              </PillButton>
              <PillButton
                variant="ghost"
                disabled={!ownsGroup}
                onPress={() =>
                  confirmAction({
                    title: "Delete group?",
                    message: "This removes the group, shared check-ins, posts, replies, and reactions.",
                    confirmText: "Delete",
                    destructive: true,
                    onConfirm: () => dispatch({ type: "deleteGroup", id: group.id }),
                  })
                }
              >
                Delete group
              </PillButton>
              {!ownsGroup ? <Body muted>Only the group owner can rename or delete this group.</Body> : null}
            </>
          ) : (
            <Body muted>Join or create a group below to start using the group feed.</Body>
          )}
        </Card>

        <Card>
          <SectionTitle>Group switcher</SectionTitle>
          {state.groups.length > 0 ? (
            <View style={{ gap: 10 }}>
              {state.groups.map((joinedGroup) => {
                const isCurrent = joinedGroup.id === state.currentGroupId;
                const isOwner = joinedGroup.ownerId === state.currentUserId;

                return (
                  <View
                    key={joinedGroup.id}
                    style={{
                      backgroundColor: isCurrent ? colors.accentSubtle : colors.elevated,
                      borderColor: isCurrent ? colors.moss : colors.line,
                      borderCurve: "continuous",
                      borderRadius: 16,
                      borderWidth: 1,
                      gap: 10,
                      padding: 12,
                    }}
                  >
                    <View style={{ gap: 3 }}>
                      <Text selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                        {joinedGroup.name}
                      </Text>
                      <Body muted>
                        {isOwner ? "Created by you" : "Joined group"} - Invite code {joinedGroup.inviteCode}
                      </Body>
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                      <PillButton
                        variant={isCurrent ? "secondary" : "ghost"}
                        disabled={isCurrent}
                        onPress={() => dispatch({ type: "switchGroup", id: joinedGroup.id })}
                      >
                        {isCurrent ? "Current" : "Switch"}
                      </PillButton>
                      {!isOwner ? (
                        <PillButton
                          variant="ghost"
                          onPress={() =>
                            confirmAction({
                              title: "Leave group?",
                              message: `You will leave ${joinedGroup.name}, but your account will stay signed in.`,
                              confirmText: "Leave",
                              destructive: true,
                              onConfirm: () => dispatch({ type: "leaveGroup", id: joinedGroup.id }),
                            })
                          }
                        >
                          Leave
                        </PillButton>
                      ) : (
                        <Body muted>Owned groups can be deleted, not left.</Body>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Body muted>You have not joined any groups yet.</Body>
          )}
        </Card>

        <Card tone="moss">
          <SectionTitle>Join or create</SectionTitle>
          <Field value={joinInviteCode} onChangeText={setJoinInviteCode} placeholder="Group code" autoCapitalize="characters" />
          <PillButton
            disabled={joinInviteCode.trim().length < 3}
            onPress={() => {
              dispatch({ type: "joinGroup", inviteCode: joinInviteCode });
              setJoinInviteCode("");
            }}
          >
            Join by code
          </PillButton>
          <Field value={newGroupName} onChangeText={setNewGroupName} placeholder="New group name" />
          <PillButton
            disabled={!newGroupName.trim()}
            onPress={() => {
              dispatch({ type: "createGroup", name: newGroupName });
              setNewGroupName("");
            }}
          >
            Create new group
          </PillButton>
          {state.authError ? <Body muted>{state.authError}</Body> : null}
        </Card>

        <Card>
          <SectionTitle>Support the journey</SectionTitle>
          <Body muted>
            KOINO keeps prayer free. If this little rhythm helps your group, you can make a voluntary support intent here.
            Payment is represented as an external provider demo, so no card data is stored in KOINO.
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[10, 25, 50].map((value) => (
              <Choice key={value} label={`${value} kr`} selected={amount === value} onPress={() => setAmount(value)} />
            ))}
            <Choice label="Custom" selected={amount === 0} onPress={() => setAmount(0)} />
          </View>
          {amount === 0 ? (
            <Field
              value={customAmount}
              onChangeText={(value) => setCustomAmount(value.replace(/[^0-9]/g, ""))}
              placeholder="Custom amount in SEK"
              keyboardType="number-pad"
            />
          ) : null}
          <PillButton
            disabled={!resolvedAmount || resolvedAmount < 1}
            onPress={() => {
              dispatch({ type: "createSupportIntent", amount: resolvedAmount });
              Linking.openURL("https://example.com/koino-support").catch(() => undefined);
            }}
          >
            Continue externally
          </PillButton>
          {state.supportIntents[0] ? <Body muted>Latest support intent: {state.supportIntents[0].amount} SEK confirmed.</Body> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}
