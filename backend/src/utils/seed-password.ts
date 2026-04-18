import bcrypt from "bcryptjs";

const password = process.argv[2] || "Admin123*";

bcrypt.hash(password, 10).then((hash) => {
  console.log(hash);
});
