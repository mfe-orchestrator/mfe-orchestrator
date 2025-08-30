import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button/button"
import { Input } from "@/components/ui/input/input"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { FileText, Folder, ChevronUp, Download, Eye, RefreshCw } from "lucide-react"

interface FileItem {
    id: string
    name: string
    type: "file" | "folder"
    size: number
    lastModified: string
    extension?: string
}

const SftpViewerPage = () => {
    const [path, setPath] = useState<string[]>(["home", "user"])
    const [items, setItems] = useState<FileItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes"
        const k = 1024
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    }

    const handleNavigate = (folderName: string) => {
        setPath([...path, folderName])
        setLoading(true)
        loadFilesForPath([...path, folderName])
    }

    const handleNavigateUp = () => {
        if (path.length > 1) {
            const newPath = [...path]
            newPath.pop()
            setPath(newPath)
            setLoading(true)
            loadFilesForPath(newPath)
        }
    }

    const navigateToBreadcrumb = (index: number) => {
        const newPath = path.slice(0, index + 1)
        setPath(newPath)
        setLoading(true)
        loadFilesForPath(newPath)
    }

    const loadFilesForPath = (pathSegments: string[]) => {
        // Simulate loading files from SFTP
        setTimeout(() => {
            const currentPath = pathSegments.join("/")

            // Mock data based on the path
            let mockFiles: FileItem[] = []

            if (currentPath === "home/user") {
                mockFiles = [
                    { id: "1", name: "documenti", type: "folder", size: 0, lastModified: "2023-05-01 10:30" },
                    { id: "2", name: "immagini", type: "folder", size: 0, lastModified: "2023-04-28 09:15" },
                    { id: "3", name: "progetti", type: "folder", size: 0, lastModified: "2023-05-10 14:22" },
                    { id: "4", name: "readme.txt", type: "file", size: 1024, lastModified: "2023-03-15 11:30", extension: "txt" },
                    { id: "5", name: "config.json", type: "file", size: 2048, lastModified: "2023-04-20 16:45", extension: "json" }
                ]
            } else if (currentPath === "home/user/documenti") {
                mockFiles = [
                    { id: "6", name: "report", type: "folder", size: 0, lastModified: "2023-04-10 08:20" },
                    { id: "7", name: "personale", type: "folder", size: 0, lastModified: "2023-03-22 15:40" },
                    { id: "8", name: "documento1.pdf", type: "file", size: 5242880, lastModified: "2023-05-02 09:10", extension: "pdf" },
                    { id: "9", name: "documento2.docx", type: "file", size: 3145728, lastModified: "2023-05-05 14:30", extension: "docx" }
                ]
            } else if (currentPath === "home/user/immagini") {
                mockFiles = [
                    { id: "10", name: "vacanze", type: "folder", size: 0, lastModified: "2022-08-15 10:20" },
                    { id: "11", name: "lavoro", type: "folder", size: 0, lastModified: "2023-01-05 11:30" },
                    { id: "12", name: "foto1.jpg", type: "file", size: 2097152, lastModified: "2022-12-25 18:10", extension: "jpg" },
                    { id: "13", name: "foto2.png", type: "file", size: 1048576, lastModified: "2023-02-14 20:45", extension: "png" }
                ]
            } else if (currentPath === "home/user/progetti") {
                mockFiles = [
                    { id: "14", name: "progetto1", type: "folder", size: 0, lastModified: "2023-04-01 09:00" },
                    { id: "15", name: "progetto2", type: "folder", size: 0, lastModified: "2023-05-08 11:45" },
                    { id: "16", name: "appunti.txt", type: "file", size: 4096, lastModified: "2023-05-09 16:20", extension: "txt" },
                    { id: "17", name: "todo.md", type: "file", size: 2048, lastModified: "2023-05-10 08:15", extension: "md" }
                ]
            } else {
                // Default folder with some files
                mockFiles = [
                    { id: `${Math.random()}`, name: "cartella1", type: "folder", size: 0, lastModified: "2023-05-01 10:30" },
                    { id: `${Math.random()}`, name: "cartella2", type: "folder", size: 0, lastModified: "2023-04-28 09:15" },
                    { id: `${Math.random()}`, name: "file1.txt", type: "file", size: 1024, lastModified: "2023-03-15 11:30", extension: "txt" },
                    { id: `${Math.random()}`, name: "file2.pdf", type: "file", size: 5242880, lastModified: "2023-05-02 09:10", extension: "pdf" }
                ]
            }

            setItems(mockFiles)
            setLoading(false)
        }, 800)
    }

    const handleRefresh = () => {
        setLoading(true)
        loadFilesForPath(path)
    }

    const handlePreviewFile = (file: FileItem) => {}

    const handleDownloadFile = (file: FileItem) => {}

    // Filter items based on search term
    const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))

    // Sort items: folders first, then files alphabetically
    const sortedItems = [...filteredItems].sort((a, b) => {
        if (a.type === "folder" && b.type === "file") return -1
        if (a.type === "file" && b.type === "folder") return 1
        return a.name.localeCompare(b.name)
    })

    // Load initial files
    useEffect(() => {
        loadFilesForPath(path)
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Visualizzatore SFTP</h2>

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Esplora File</CardTitle>
                                <CardDescription>Visualizza e gestisci i file sul server SFTP</CardDescription>
                            </div>
                            <Button variant="secondary" size="icon" onClick={handleRefresh}>
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Button variant="secondary" size="sm" onClick={handleNavigateUp} disabled={path.length <= 1}>
                                    <ChevronUp className="h-4 w-4 mr-1" />
                                    Livello superiore
                                </Button>

                                <Breadcrumb className="overflow-x-auto py-1">
                                    <BreadcrumbList>
                                        {path.map((segment, index) => (
                                            <BreadcrumbItem key={index}>
                                                {index < path.length - 1 ? (
                                                    <>
                                                        <BreadcrumbLink onClick={() => navigateToBreadcrumb(index)}>{segment}</BreadcrumbLink>
                                                        <BreadcrumbSeparator />
                                                    </>
                                                ) : (
                                                    <BreadcrumbPage>{segment}</BreadcrumbPage>
                                                )}
                                            </BreadcrumbItem>
                                        ))}
                                    </BreadcrumbList>
                                </Breadcrumb>
                            </div>

                            <div>
                                <Input placeholder="Cerca file e cartelle..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-sm" />
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableCaption>{loading ? "Caricamento in corso..." : `${filteredItems.length} elementi in ${path.join("/")}`}</TableCaption>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[40%]">Nome</TableHead>
                                            <TableHead>Dimensione</TableHead>
                                            <TableHead className="hidden md:table-cell">Ultima Modifica</TableHead>
                                            <TableHead className="text-right">Azioni</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">
                                                    <span className="loader mx-auto"></span>
                                                </TableCell>
                                            </TableRow>
                                        ) : sortedItems.length > 0 ? (
                                            sortedItems.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            {item.type === "folder" ? <Folder className="h-5 w-5 text-blue-500" /> : <FileText className="h-5 w-5 text-gray-500" />}
                                                            <span
                                                                className={item.type === "folder" ? "cursor-pointer hover:underline text-blue-600 dark:text-blue-400" : ""}
                                                                onClick={() => item.type === "folder" && handleNavigate(item.name)}
                                                            >
                                                                {item.name}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{item.type === "folder" ? "—" : formatBytes(item.size)}</TableCell>
                                                    <TableCell className="hidden md:table-cell">{item.lastModified}</TableCell>
                                                    <TableCell className="text-right">
                                                        {item.type === "file" && (
                                                            <div className="flex gap-2 justify-end">
                                                                <Button variant="ghost" size="icon" onClick={() => handlePreviewFile(item)}>
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" onClick={() => handleDownloadFile(item)}>
                                                                    <Download className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                        {item.type === "folder" && (
                                                            <Button variant="ghost" size="sm" onClick={() => handleNavigate(item.name)}>
                                                                Apri
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                    Nessun elemento trovato
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <div className="text-sm text-muted-foreground">
                            {filteredItems.filter(item => item.type === "folder").length} cartelle, {filteredItems.filter(item => item.type === "file").length} file
                        </div>
                        <Button variant="secondary" size="sm" disabled={loading} onClick={handleRefresh}>
                            Aggiorna
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}

export default SftpViewerPage
