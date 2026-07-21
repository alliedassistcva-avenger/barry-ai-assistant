export type ConsequentialActionType =
  | "spend_money"
  | "publish_external"
  | "deploy_production"
  | "delete_data"
  | "send_external"
  | "modify_billing"
  | "connect_paid_service";

export interface HostAction {
  id: string;
  label: string;
  description: string;
  integrationId?: string;
  consequentialActions?: ConsequentialActionType[];
  estimatedCostUsd?: number;
  target?: string;
}

export interface ConfirmationRecord {
  actionId: string;
  confirmed: boolean;
  confirmedAt: string;
  confirmedBy: string;
  exactActionLabel: string;
}

export interface ConfirmationRequest {
  actionId: string;
  requiredActionLabel: string;
  message: string;
}

export class ConfirmationRequiredError extends Error {
  constructor(public readonly request: ConfirmationRequest) {
    super(request.message);
    this.name = "ConfirmationRequiredError";
  }
}

export function requiresConfirmation(action: HostAction): boolean {
  return Boolean(action.consequentialActions?.length);
}

export function buildConfirmationRequest(action: HostAction): ConfirmationRequest {
  const consequences = action.consequentialActions?.join(", ") || "consequential_action";
  const target = action.target ? ` Target: ${action.target}.` : "";
  const cost =
    typeof action.estimatedCostUsd === "number"
      ? ` Estimated cost: $${action.estimatedCostUsd.toFixed(2)}.`
      : "";

  return {
    actionId: action.id,
    requiredActionLabel: action.label,
    message:
      `Please confirm this exact action before I run it: "${action.label}". ` +
      `Consequence type: ${consequences}.${target}${cost}`,
  };
}

export function assertActionMayRun(
  action: HostAction,
  confirmation?: ConfirmationRecord
): void {
  if (!requiresConfirmation(action)) {
    return;
  }

  const request = buildConfirmationRequest(action);

  if (!confirmation?.confirmed) {
    throw new ConfirmationRequiredError(request);
  }

  if (confirmation.actionId !== action.id) {
    throw new ConfirmationRequiredError(request);
  }

  if (confirmation.exactActionLabel !== action.label) {
    throw new ConfirmationRequiredError(request);
  }
}

export async function runConfirmedAction<T>(
  action: HostAction,
  confirmation: ConfirmationRecord | undefined,
  execute: () => Promise<T>
): Promise<T> {
  assertActionMayRun(action, confirmation);
  return execute();
}

