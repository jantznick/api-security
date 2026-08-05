export function getAdminEmail() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

export function isAdminEmail(email) {
  const adminEmail = getAdminEmail();
  if (!adminEmail || !email) {
    return false;
  }
  return email.trim().toLowerCase() === adminEmail;
}

export function withAdminFlag(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    isAdmin: isAdminEmail(user.email),
  };
}
