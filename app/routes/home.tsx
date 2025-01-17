import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Progress } from "~/components/ui/progress";
import { Textarea } from "~/components/ui/textarea";

type ProvenanceEntry = {
  method: string;
  arguments: string[];
  result: string;
  user_bottom_stack: string;
  user_top_stack: string;
  floc: string;
};

export function meta() {
  return [
    { title: "Expression Provenance Viewer" },
    {
      name: "description", 
      content: "Visualize expression provenance and stack traces"
    },
  ];
}
const EXAMPLE_DATA = [
  {
    method: "floordiv",
    arguments: ["s1", "2"],
    result: "(s1//2)",
    user_bottom_stack: "latent = self.proj(latent)  # pytorch-env/lib/python3.10/site-packages/diffusers/models/embeddings.py:545 in forward",
    user_top_stack: "hidden_states = self.pos_embed(hidden_states)  # takes care of adding positional embeddings too.  # pytorch-env/lib/python3.10/site-packages/diffusers/models/transformers/transformer_sd3.py:391 in forward",
    floc: "<FrameSummary file /home/bobren/local/a/pytorch/torch/_meta_registrations.py, line 2183 in _formula>"
  },
  {
    method: "mul",
    arguments: ["1536", "(s1//2)"],
    result: "1536*((s1//2))",
    user_bottom_stack: "latent = self.proj(latent)  # pytorch-env/lib/python3.10/site-packages/diffusers/models/embeddings.py:545 in forward", 
    user_top_stack: "hidden_states = self.pos_embed(hidden_states)  # takes care of adding positional embeddings too.  # pytorch-env/lib/python3.10/site-packages/diffusers/models/transformers/transformer_sd3.py:391 in forward",
    floc: "<FrameSummary file /home/bobren/local/a/pytorch/torch/_meta_registrations.py, line 2183 in _formula>"
  },
  {
    method: "gt",
    arguments: ["1536*((s1//2))", "1536"],
    result: "1536*((s1//2)) > 1536",
    user_bottom_stack: "latent = self.proj(latent)  # pytorch-env/lib/python3.10/site-packages/diffusers/models/embeddings.py:545 in forward",
    user_top_stack: "hidden_states = self.pos_embed(hidden_states)  # takes care of adding positional embeddings too.  # pytorch-env/lib/python3.10/site-packages/diffusers/models/transformers/transformer_sd3.py:391 in forward",
    floc: "<FrameSummary file /home/bobren/local/a/pytorch/torch/_meta_registrations.py, line 2183 in _formula>"
  }
];

let FLAG = true;

export default function Home() {
  const [provenanceData, setProvenanceData] = useState<ProvenanceEntry[]>(EXAMPLE_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(true);
  const [dataInput, setDataInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const loadData = async () => {
      if (!FLAG) {
        return;
      }
      setDialogOpen(true);
    };
    loadData();
  }, []);

  // Build a map of expressions to their provenance entries
  const buildExpressionMap = (entries: ProvenanceEntry[]) => {    const expressionMap = new Map<string, ProvenanceEntry>();
    const dependencyMap = new Map<string, Set<string>>();
    const argumentMap = new Map<string, Set<string>>();

    entries.forEach(entry => {
      expressionMap.set(entry.result, entry);
      
      // Track dependencies (results that depend on this result)
      entry.arguments.forEach(arg => {
        if (!dependencyMap.has(arg)) {
          dependencyMap.set(arg, new Set());
        }
        dependencyMap.get(arg)?.add(entry.result);

        // Track arguments (results that this result depends on)
        if (!argumentMap.has(entry.result)) {
          argumentMap.set(entry.result, new Set());
        }
        argumentMap.get(entry.result)?.add(arg);
      });
    });

    return { expressionMap, dependencyMap, argumentMap };
  };

  const renderExpressionTrie = (
    expr: string,
    expressionMap: Map<string, ProvenanceEntry>,
    argumentMap: Map<string, Set<string>>,
    depth = 0,
    visited = new Set<string>()
  ): JSX.Element | null => {
    if (visited.has(expr)) return null;
    visited.add(expr);

    const entry = expressionMap.get(expr);
    if (!entry) return null;

    const args = argumentMap.get(expr) || new Set();
    const childrenElements: JSX.Element[] = [];

    // Only render children that are in the parent's arguments array
    entry.arguments.forEach(parentArg => {
      if (expressionMap.has(parentArg)) {
        const childElement = renderExpressionTrie(parentArg, expressionMap, argumentMap, depth + 1, visited);
        if (childElement) {
          childrenElements.push(childElement);
        }
      }
    });

    return (
      <div key={expr} className="mb-2" style={{ marginLeft: `${depth * 20}px` }}>
        <div className="p-4 border rounded shadow bg-white">
          <h3 className="font-bold text-lg">{expr}</h3>
          <div className="mt-2">
            <p><span className="font-semibold">Method:</span> {entry.method}</p>
            <p><span className="font-semibold">Arguments:</span> {entry.arguments.join(", ")}</p>
            <div className="mt-2 text-sm text-gray-600">
              <p><span className="font-semibold">User entry code:</span> {entry.user_top_stack}</p>
              <p><span className="font-semibold">User exit code:</span> {entry.user_bottom_stack}</p>
              <p><span className="font-semibold">Framework code:</span> {entry.floc}</p>
            </div>
          </div>
        </div>
        {childrenElements.length > 0 && (
          <div className="ml-4 pl-4 border-l border-gray-300 mt-2">
            {childrenElements}
          </div>
        )}
      </div>
    );
  };

  const { expressionMap, dependencyMap, argumentMap } = buildExpressionMap(provenanceData);

  const handleDataSubmit = () => {
    if (dataInput) {
      let parsedData;
      try {
        // Handle both regular JSON and line-delimited JSON
        const lines = [...new Set(dataInput.split('\n').filter(line => line.trim()))];
        if (lines.length > 1) {
          // Try parsing as line-delimited JSON
          parsedData = lines.flatMap(line => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          });
        } else {
          // Try parsing as regular JSON
          parsedData = JSON.parse(dataInput);
        }

        if (Array.isArray(parsedData)) {
          FLAG = false;
          setProvenanceData(parsedData);
        } else {
          alert("Invalid data format. Using example data instead.");
          setProvenanceData(EXAMPLE_DATA);
        }
      } catch {
        alert("Invalid JSON format. Using example data instead.");
        setProvenanceData(EXAMPLE_DATA);
      }
    } else {
      setProvenanceData(EXAMPLE_DATA);
    }
    setProgress(100);
    setIsLoading(false);
    setDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col gap-4 items-center justify-center">
        <Progress value={progress} className="w-[60%]" />
        <p className="text-sm text-muted-foreground">Loading provenance data...</p>
      </div>
    );
  }

  const filteredExpressions = searchTerm 
    ? Array.from(expressionMap.keys()).filter(expr => expr.toLowerCase().includes(searchTerm.toLowerCase()))
    : Array.from(expressionMap.keys());

  return (
    <div className="h-screen flex flex-col">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom Provenance Data</DialogTitle>
            <DialogDescription>
              Would you like to provide your own provenance data? If not, an example will be used.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Paste your provenance data as JSON array..."
            value={dataInput}
            onChange={(e) => setDataInput(e.target.value)}
            className="min-h-[400px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Use Example
            </Button>
            <Button onClick={handleDataSubmit}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 border-b">
        <input
          type="text"
          placeholder="Search for an expression..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filteredExpressions.map(expr => 
          renderExpressionTrie(expr, expressionMap, argumentMap)
        )}
      </div>
    </div>
  );
}
