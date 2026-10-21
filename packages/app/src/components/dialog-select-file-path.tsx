import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { List } from "@opencode-ai/ui/list"
import { getDirectory, getFilename } from "@opencode-ai/core/util/path"
import { useLanguage } from "@/context/language"

export function DialogSelectFilePath(props: { paths: string[]; onSelect: (path: string) => void }) {
  const dialog = useDialog()
  const language = useLanguage()

  const select = (path: string | undefined) => {
    if (!path) return
    dialog.close()
    props.onSelect(path)
  }

  return (
    <Dialog title={language.t("dialog.directory.action.selectFile")} class="pt-3 pb-0 !max-h-[480px]">
      <List
        class="px-3"
        search={{ placeholder: language.t("session.header.searchFiles"), autofocus: true, hideIcon: true }}
        emptyMessage={language.t("palette.empty")}
        items={props.paths}
        key={(path) => path}
        onSelect={select}
      >
        {(path) => (
          <div class="w-full flex items-center gap-x-3 rounded-md pl-1">
            <FileIcon node={{ path, type: "file" }} class="shrink-0 size-4" />
            <div class="flex items-center text-14-regular min-w-0">
              <span class="text-text-weak whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0">
                {getDirectory(path)}
              </span>
              <span class="text-text-strong whitespace-nowrap">{getFilename(path)}</span>
            </div>
          </div>
        )}
      </List>
    </Dialog>
  )
}
