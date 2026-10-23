// Validate .pptx files with Microsoft's Open XML SDK validator, the schema plus the semantic
// rules Office applies on open. Prints one JSON object per file: {"file", "errors": [{"part",
// "path", "id", "description"}]}. Exit 0 when every file is clean, 1 when any has an error.
using System.Text.Json;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

var results = new List<object>();
var failed = false;
foreach (var file in args)
{
    var errors = new List<object>();
    try
    {
        using var doc = PresentationDocument.Open(file, false);
        var validator = new OpenXmlValidator(DocumentFormat.OpenXml.FileFormatVersions.Microsoft365);
        foreach (var e in validator.Validate(doc))
            errors.Add(new { part = e.Part?.Uri.ToString(), path = e.Path?.XPath, id = e.Id, description = e.Description });
    }
    catch (Exception ex)
    {
        errors.Add(new { part = (string?)null, path = (string?)null, id = "open", description = ex.Message });
    }
    if (errors.Count > 0) failed = true;
    results.Add(new { file, errors });
}
Console.WriteLine(JsonSerializer.Serialize(results));
return failed ? 1 : 0;
