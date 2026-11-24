"use client";

/**
 * TeamInviteForm — invite someone to the team. Rendered only when
 * `can.invite_administrator` or `can.invite_representative` is true, and
 * the role select offers only the roles `can` allows.
 *
 * The CURRENT PASSWORD field appears only when
 * `requires_password_to_invite[role]` is true for the chosen role, and
 * `current_password` is sent only then: a representative invite that
 * needs no password never carries one. The password is the viewer's own
 * (an administrator inviting a representative uses theirs). Switching to
 * a role that needs none empties it.
 *
 * The picker is the mention search; the server re-checks the invitee
 * and answers every refusal with one generic line.
 */

import { useId, useRef, useState, type FormEvent } from "react";

import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_LABEL_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/components/admin/validators/form-classes";
import { PasswordConfirmField } from "@/components/admin/validators/PasswordConfirmField";
import { TeamMemberPicker } from "@/components/validator-team/TeamMemberPicker";
import {
  isCredentialInvalid,
  ROLE_LABEL,
  TEAM_ERROR_COPY,
  teamWriteErrorCopy,
} from "@/components/validator-team/team-copy";
import { mutateThenReset, useInviteValidatorTeamMember } from "@/hooks/useValidatorTeam";
import { invalidField } from "@/lib/api/admin-errors";
import type {
  AdminUserRef,
  InviteValidatorTeamMemberRequest,
  ValidatorTeamCan,
  ValidatorTeamResponse,
  ValidatorTeamRole,
} from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";

export const INVITE_COPY = {
  heading: "Invite someone",
  intro: "They join the team once they accept. An invite nobody accepts expires.",
  memberRequired: "Pick someone to invite.",
  roleRequired: "Pick a role.",
} as const;

/** The contract's two roles, in the order the select lists them. */
const ROLES: readonly ValidatorTeamRole[] = ["administrator", "representative"];

/** The roles `can` lets the viewer invite. Only an explicit `true` counts. */
export function invitableRoles(can: ValidatorTeamCan): ValidatorTeamRole[] {
  return ROLES.filter((role) =>
    role === "administrator" ? can.invite_administrator === true : can.invite_representative === true,
  );
}

type FieldErrors = Partial<Record<"member" | "role" | "password", string | undefined>>;

export interface TeamInviteFormProps {
  pageId: number;
  data: ValidatorTeamResponse;
}

export function TeamInviteForm({ pageId, data }: TeamInviteFormProps) {
  const invite = useInviteValidatorTeamMember(pageId);
  const roles = invitableRoles(data.can);
  const onlyRole = roles.length === 1 ? (roles[0] ?? "") : "";

  const [member, setMember] = useState<AdminUserRef | null>(null);
  const [role, setRole] = useState<ValidatorTeamRole | "">(onlyRole);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // The server asked for a password the response didn't flag (a 422 on
  // `current_password`): show the field for that role from then on.
  const [askedFor, setAskedFor] = useState<ValidatorTeamRole | null>(null);
  // Same-frame repeat presses: React Query's isPending lags one render.
  const latch = useRef(false);

  const memberInputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const id = useId();
  const headingId = `${id}-heading`;
  const memberId = `${id}-member`;
  const memberLabelId = `${id}-member-label`;
  const roleId = `${id}-role`;
  const passwordId = `${id}-password`;
  const errId = (field: keyof FieldErrors) => `${id}-${field}-error`;
  const formErrorId = `${id}-form-error`;

  // A role outside what `can` allows (it changed under the form) counts as unchosen.
  const chosenRole: ValidatorTeamRole | "" = role !== "" && roles.includes(role) ? role : "";
  const needsPassword =
    chosenRole !== "" &&
    (data.requires_password_to_invite?.[chosenRole] === true || askedFor === chosenRole);

  function focusMember() {
    (memberInputRef.current ?? changeRef.current)?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (latch.current || invite.isPending) return;
    const next: FieldErrors = {};
    if (member === null) next.member = INVITE_COPY.memberRequired;
    if (chosenRole === "") next.role = INVITE_COPY.roleRequired;
    if (needsPassword && password === "") next.password = TEAM_ERROR_COPY.passwordRequired;
    setErrors(next);
    setFormError(null);
    setSent(null);
    if (member === null || chosenRole === "" || next.password !== undefined) {
      if (next.member !== undefined) focusMember();
      else if (next.role !== undefined) roleRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    const body: InviteValidatorTeamMemberRequest = { user_id: member.user_id, role: chosenRole };
    if (needsPassword) body.current_password = password;
    latch.current = true;
    const invitee = member;
    mutateThenReset(invite, body, {
      onSuccess: (res) => {
        latch.current = false;
        setMember(null);
        setRole(onlyRole);
        setPassword("");
        const expires = res.membership.expires_at;
        setSent(
          typeof expires === "string" && expires !== ""
            ? `Invite sent to @${invitee.handle}. It expires ${formatShortDate(expires)}.`
            : `Invite sent to @${invitee.handle}.`,
        );
        // The picked member's chip is gone; its search box is back.
        window.setTimeout(() => memberInputRef.current?.focus(), 0);
      },
      onError: (err) => {
        latch.current = false;
        if (isCredentialInvalid(err)) {
          setPassword("");
          setErrors({ password: TEAM_ERROR_COPY.credentialInvalid });
          passwordRef.current?.focus();
          return;
        }
        const field = invalidField(err);
        if (field === "user_id") {
          setErrors({ member: TEAM_ERROR_COPY.rejected });
          focusMember();
        } else if (field === "role") {
          setErrors({ role: TEAM_ERROR_COPY.rejected });
          roleRef.current?.focus();
        } else if (field === "current_password") {
          setAskedFor(chosenRole);
          setPassword("");
          setErrors({ password: TEAM_ERROR_COPY.passwordRequired });
          window.setTimeout(() => passwordRef.current?.focus(), 0);
        } else {
          setFormError(teamWriteErrorCopy(err, { invite: true }));
        }
      },
    });
  }

  return (
    <section aria-labelledby={headingId} className="bcc-panel flex flex-col gap-4 p-5 sm:p-6">
      <h2 id={headingId} className="bcc-stencil text-2xl text-bcc-text">
        {INVITE_COPY.heading}
      </h2>
      <p className="font-serif text-bcc-text-secondary">{INVITE_COPY.intro}</p>

      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label id={memberLabelId} htmlFor={memberId} className={ADMIN_LABEL_CLASS}>
            MEMBER
          </label>
          <TeamMemberPicker
            id={memberId}
            labelId={memberLabelId}
            value={member}
            onChange={(next) => {
              setMember(next);
              setErrors((prev) => ({ ...prev, member: undefined }));
            }}
            invalid={errors.member !== undefined}
            describedBy={errors.member !== undefined ? errId("member") : undefined}
            inputRef={memberInputRef}
            changeRef={changeRef}
          />
          {errors.member !== undefined && (
            <p id={errId("member")} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
              {errors.member}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={roleId} className={ADMIN_LABEL_CLASS}>
            ROLE
          </label>
          <select
            ref={roleRef}
            id={roleId}
            value={chosenRole}
            onChange={(e) => {
              const next = e.target.value as ValidatorTeamRole | "";
              setRole(next);
              setErrors((prev) => ({ ...prev, role: undefined, password: undefined }));
              // Never keep a password for a role that doesn't ask for one.
              if (next === "" || (data.requires_password_to_invite?.[next] !== true && askedFor !== next)) {
                setPassword("");
              }
            }}
            aria-invalid={errors.role !== undefined}
            aria-describedby={errors.role !== undefined ? errId("role") : undefined}
            className={ADMIN_INPUT_CLASS}
          >
            {roles.length > 1 && <option value="">Choose…</option>}
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {errors.role !== undefined && (
            <p id={errId("role")} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
              {errors.role}
            </p>
          )}
        </div>

        {needsPassword && (
          <div className="flex flex-col gap-2">
            <PasswordConfirmField
              ref={passwordRef}
              id={passwordId}
              value={password}
              onChange={(value) => {
                setPassword(value);
                setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              invalid={errors.password !== undefined}
              describedBy={errors.password !== undefined ? errId("password") : undefined}
            />
            {errors.password !== undefined && (
              <p id={errId("password")} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
                {errors.password}
              </p>
            )}
          </div>
        )}

        {formError !== null && (
          <p id={formErrorId} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
            {formError}
          </p>
        )}
        <p role="status" className="font-serif text-bcc-text empty:hidden">
          {sent ?? ""}
        </p>

        <div className="flex justify-end">
          <button
            type="submit"
            aria-disabled={invite.isPending}
            aria-busy={invite.isPending}
            aria-describedby={formError !== null ? formErrorId : undefined}
            className={ADMIN_PRIMARY_BUTTON_CLASS}
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </section>
  );
}
