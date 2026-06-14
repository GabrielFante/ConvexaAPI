import { env } from "./shared/env";
import { app } from "./app";

app.listen(env.PORT, () => {
  console.log(`API running on port ${env.PORT}`);
});
