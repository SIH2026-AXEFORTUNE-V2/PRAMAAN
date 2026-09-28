import { Check, Languages } from "lucide-react";
import { cx } from "@/lib/format";
import { IconButton } from "@/components/ui/Button";
import { MenuButton } from "@/components/ui/Menu";
import { LANGUAGES, tr, useI18n } from "./index";

export function LanguageMenu() {
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  return (
    <MenuButton
      label={tr("Interface language")}
      trigger={(open, toggle) => (
        <IconButton label={tr("Interface language")} onClick={toggle} active={open}>
          <Languages size={16} />
        </IconButton>
      )}
      items={LANGUAGES.map((l) => ({
        label: l.native,
        hint: l.code === lang ? undefined : l.name,
        icon: <Check size={13} className={cx(l.code === lang ? "text-accent" : "opacity-0")} />,
        onSelect: () => void setLang(l.code),
      }))}
    />
  );
}
