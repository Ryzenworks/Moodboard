Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$csCode = @'
using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Collections.Generic;

public class MoodboardExporter
{
    public static void Export(string backupFile, string outputZip)
    {
        if (File.Exists(outputZip)) File.Delete(outputZip);
        
        var fileLen = new FileInfo(backupFile).Length;
        Console.WriteLine("Reading: " + backupFile + " (" + (fileLen / 1048576) + " MB)");
        Console.WriteLine("Output:  " + outputZip);
        
        using (var zipStream = File.Create(outputZip))
        using (var zip = new ZipArchive(zipStream, ZipArchiveMode.Create))
        using (var reader = new StreamReader(backupFile, Encoding.UTF8, true, 4194304))
        {
            var buf = new char[4194304];
            var sb = new StringBuilder(8388608);
            bool foundImages = false;
            int depth = 0;
            bool inStr = false, esc = false;
            int objStart = -1;
            int imgCount = 0;
            long charsTotal = 0;
            var usedNames = new Dictionary<string, int>();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            long lastMs = 0;
            
            int charsRead;
            while ((charsRead = reader.Read(buf, 0, buf.Length)) > 0)
            {
                charsTotal += charsRead;
                
                if (!foundImages)
                {
                    sb.Append(buf, 0, charsRead);
                    string text = sb.ToString();
                    int idx = text.IndexOf("\"images\":[");
                    if (idx >= 0)
                    {
                        foundImages = true;
                        string remainder = text.Substring(idx + 10);
                        sb.Clear();
                        sb.Append(remainder);
                        Console.WriteLine("Found images array, extracting...");
                        Console.Out.Flush();
                    }
                    else if (sb.Length > 50000)
                    {
                        string t = sb.ToString();
                        sb.Clear();
                        sb.Append(t.Substring(t.Length - 500));
                    }
                    continue;
                }
                
                sb.Append(buf, 0, charsRead);
                string current = sb.ToString();
                
                for (int i = 0; i < current.Length; i++)
                {
                    char ch = current[i];
                    if (esc) { esc = false; continue; }
                    if (ch == '\\' && inStr) { esc = true; continue; }
                    if (ch == '"') { inStr = !inStr; continue; }
                    if (inStr) continue;
                    
                    if (ch == '{')
                    {
                        if (depth == 0) objStart = i;
                        depth++;
                    }
                    else if (ch == '}')
                    {
                        depth--;
                        if (depth == 0 && objStart >= 0)
                        {
                            // Process this image object directly using IndexOf on `current`
                            int oStart = objStart;
                            int oEnd = i + 1;
                            
                            // Extract filename via IndexOf (small field, fast)
                            string filename = "image.png";
                            int fnIdx = current.IndexOf("\"filename\":\"", oStart);
                            if (fnIdx >= 0 && fnIdx < oEnd)
                            {
                                int fnStart = fnIdx + 12;
                                int fnEnd = current.IndexOf('"', fnStart);
                                if (fnEnd > fnStart && fnEnd < oEnd)
                                    filename = current.Substring(fnStart, fnEnd - fnStart);
                            }
                            
                            // Handle duplicates
                            if (usedNames.ContainsKey(filename))
                            {
                                usedNames[filename]++;
                                int dot = filename.LastIndexOf('.');
                                if (dot > 0)
                                    filename = filename.Substring(0, dot) + "_" + usedNames[filename] + filename.Substring(dot);
                                else
                                    filename += "_" + usedNames[filename];
                            }
                            else usedNames[filename] = 0;
                            
                            // Find base64 data directly - look for the comma after data:image
                            int srcIdx = current.IndexOf("\"src\":\"data:image/", oStart);
                            if (srcIdx >= 0 && srcIdx < oEnd)
                            {
                                int commaIdx = current.IndexOf(',', srcIdx);
                                if (commaIdx >= 0 && commaIdx < oEnd)
                                {
                                    int b64Start = commaIdx + 1;
                                    // Find closing quote - scan for unescaped "
                                    int b64End = b64Start;
                                    bool e2 = false;
                                    while (b64End < oEnd)
                                    {
                                        if (e2) { e2 = false; b64End++; continue; }
                                        if (current[b64End] == '\\') { e2 = true; b64End++; continue; }
                                        if (current[b64End] == '"') break;
                                        b64End++;
                                    }
                                    
                                    // Decode directly from substring (no extra copy)
                                    string base64 = current.Substring(b64Start, b64End - b64Start);
                                    
                                    // Detect actual MIME and fix extension
                                    int mimeStart = current.IndexOf("data:image/", srcIdx) + 11;
                                    int mimeEnd = current.IndexOf(';', mimeStart);
                                    if (mimeEnd > mimeStart && mimeEnd < commaIdx)
                                    {
                                        string mime = current.Substring(mimeStart, mimeEnd - mimeStart);
                                        string correctExt = ".png";
                                        if (mime == "jpeg" || mime == "jpg") correctExt = ".jpg";
                                        else if (mime == "webp") correctExt = ".webp";
                                        else if (mime == "gif") correctExt = ".gif";
                                        else if (mime == "svg+xml") correctExt = ".svg";
                                        else if (mime == "bmp") correctExt = ".bmp";
                                        else if (mime == "avif") correctExt = ".avif";
                                        int dotIdx = filename.LastIndexOf('.');
                                        string basePart = dotIdx > 0 ? filename.Substring(0, dotIdx) : filename;
                                        filename = basePart + correctExt;
                                    }
                                    
                                    try
                                    {
                                        byte[] imageBytes = Convert.FromBase64String(base64);
                                        var entry = zip.CreateEntry(filename, CompressionLevel.NoCompression);
                                        using (var es = entry.Open())
                                            es.Write(imageBytes, 0, imageBytes.Length);
                                        imgCount++;
                                    }
                                    catch (Exception ex)
                                    {
                                        Console.WriteLine("  Skip " + filename + ": " + ex.Message);
                                    }
                                }
                            }
                            
                            objStart = -1;
                            
                            if (sw.ElapsedMilliseconds - lastMs >= 2000)
                            {
                                int pct = (int)(charsTotal * 100 / fileLen);
                                Console.WriteLine("  " + imgCount + " images (" + pct + "%)");
                                Console.Out.Flush();
                                lastMs = sw.ElapsedMilliseconds;
                            }
                        }
                    }
                    else if (ch == ']' && depth == 0)
                    {
                        goto done;
                    }
                }
                
                if (depth > 0 && objStart >= 0)
                {
                    string leftover = current.Substring(objStart);
                    sb.Clear();
                    sb.Append(leftover);
                    objStart = 0;
                }
                else
                {
                    sb.Clear();
                }
                inStr = false;
                esc = false;
            }
            
            done:
            sw.Stop();
            Console.WriteLine();
            Console.WriteLine("Done! " + imgCount + " images in " + (sw.ElapsedMilliseconds / 1000) + "s");
        }
        
        var zipInfo = new FileInfo(outputZip);
        Console.WriteLine("ZIP: " + outputZip + " (" + (zipInfo.Length / 1048576) + " MB)");
    }
}
'@

Add-Type -TypeDefinition $csCode -ReferencedAssemblies @(
    "System.IO.Compression",
    "System.IO.Compression.FileSystem"
)

[MoodboardExporter]::Export(
    "C:\Users\Maroof\Downloads\PNG\moodboard-backup.json",
    "C:\Users\Maroof\Downloads\PNG\moodboard-images.zip"
)
