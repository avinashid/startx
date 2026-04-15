import { render } from "@react-email/render";
import React, { createElement } from "react";
import * as emails from "./emails/emails.js";
export type AvailableEmails = keyof typeof emails;
export type EmailProps<T extends AvailableEmails> = React.ComponentProps<(typeof emails)[T]>;

// eslint-disable-next-line @typescript-eslint/naming-convention
export function EmailTemplate<T extends AvailableEmails>(name: T, props: EmailProps<T>) {
	// eslint-disable-next-line import-x/namespace
	const Component = emails[name] as React.ElementType;
	return render(createElement(Component, props));
}
