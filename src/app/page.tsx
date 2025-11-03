"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  memo,
} from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import {
  ArrowUpIcon,
  LocateFixed,
  PlusIcon,
  XIcon,
  ZoomInIcon,
  GitBranch,
} from "lucide-react";
import Image from "next/image";
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatNode {
  id: number;
  quotedText?: string;
  children: ChatNode[];
  x: number;
  y: number;
  height: number;
  manualPosition?: boolean;
  conversation: ChatMessage[];
  isThinking?: boolean;
}

function truncateSelection(text: string): string {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const firstTwo = lines.slice(0, 2).join(" ");
  const maxChars = 240;
  const truncated =
    firstTwo.length > maxChars ? firstTwo.slice(0, maxChars) + "…" : firstTwo;
  return truncated;
}

function convertSimpleMarkdown(text: string): string {
  return marked(text) as string;
}

const ConversationContent = memo(function ConversationContent({
  conversation,
  isThinking,
}: {
  conversation: ChatMessage[];
  isThinking?: boolean;
}) {
  return (
    <>
      {conversation.map((msg, index) =>
        msg.role === "user" ? (
          <div className="mb-2" key={index}>
            <p className="text-gray-900 font-semibold text-lg">{msg.content}</p>
          </div>
        ) : (
          <div
            className="text-gray-700 text-base mb-6 leading-relaxed whitespace-pre-wrap wrap-break-word prose"
            key={index}
            dangerouslySetInnerHTML={{
              __html: convertSimpleMarkdown(msg.content),
            }}
          />
        )
      )}

      {isThinking && (
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
          <div className="w-2 h-2 bg-black rounded-full animate-pulse"></div>
        </div>
      )}
    </>
  );
});

function DraggableChat({
  id,
  initialX = 100,
  initialY = 100,
  scale = 1,
  canvasPosition = { x: 0, y: 0 },
  quotedText,
  conversation,
  isThinking,
  onNewMessage,
  onCreateFromSelection,
  onPositionChange,
  onBranch,
  onDelete,
  isRoot,
}: {
  id: number;
  initialX?: number;
  initialY?: number;
  scale?: number;
  canvasPosition?: { x: number; y: number };
  quotedText?: string;
  conversation: ChatMessage[];
  isThinking?: boolean;
  onNewMessage: (payload: { chatId: number; message: string }) => void;
  onCreateFromSelection?: (payload: {
    sourceChatId: number;
    text: string;
    viewportX: number;
    viewportY: number;
  }) => void;
  onPositionChange?: (payload: {
    chatId: number;
    x: number;
    y: number;
  }) => void;
  onBranch?: (chatId: number) => void;
  onDelete?: (chatId: number) => void;
  isRoot: boolean;
}) {
  const [boxPosition, setBoxPosition] = useState({ x: initialX, y: initialY });
  const [inputValue, setInputValue] = useState("");
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSelectionButtonVisible, setIsSelectionButtonVisible] =
    useState(false);
  const selectionButtonPosRef = useRef({ x: 0, y: 0 });
  const [selectionAnchor, setSelectionAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionText, setSelectionText] = useState("");

  useEffect(() => {
    setBoxPosition({ x: initialX, y: initialY });
  }, [initialX, initialY]);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isDraggingRef.current = true;
    const canvasX = (e.clientX - canvasPosition.x) / scale;
    const canvasY = (e.clientY - canvasPosition.y) / scale;
    dragStartRef.current = {
      x: canvasX - boxPosition.x,
      y: canvasY - boxPosition.y,
    };
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const canvasX = (e.clientX - canvasPosition.x) / scale;
        const canvasY = (e.clientY - canvasPosition.y) / scale;
        const nextX = canvasX - dragStartRef.current.x;
        const nextY = canvasY - dragStartRef.current.y;
        setBoxPosition({ x: nextX, y: nextY });
        if (onPositionChange) {
          onPositionChange({ chatId: id, x: nextX, y: nextY });
        }
      }
    };

    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [scale, canvasPosition, id, onPositionChange]);

  useEffect(() => {
    let showTimer: NodeJS.Timeout;
    const handleMouseUp = () => {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        const container = cardRef.current;
        if (!container) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          if (isSelectionButtonVisible) setIsSelectionButtonVisible(false);
          return;
        }

        const anchor = sel.anchorNode;
        const focus = sel.focusNode;
        if (
          !anchor ||
          !focus ||
          !container.contains(anchor) ||
          !container.contains(focus)
        ) {
          if (isSelectionButtonVisible) setIsSelectionButtonVisible(false);
          return;
        }

        const range = sel.getRangeAt(0);
        const clientRects = range.getClientRects();
        if (clientRects.length === 0) {
          if (isSelectionButtonVisible) setIsSelectionButtonVisible(false);
          return;
        }

        const firstLineRect =
          clientRects.length > 0
            ? clientRects[0]
            : range.getBoundingClientRect();
        if (firstLineRect.width === 0 && firstLineRect.height === 0) {
          if (isSelectionButtonVisible) setIsSelectionButtonVisible(false);
          return;
        }

        const cardRect = container.getBoundingClientRect();
        selectionButtonPosRef.current = {
          x: cardRect.right + 10,
          y: firstLineRect.top + firstLineRect.height / 2 - 12,
        };
        setIsSelectionButtonVisible(true);

        setSelectionAnchor({
          x: cardRect.right,
          y: firstLineRect.top + firstLineRect.height / 2,
        });
        setSelectionText(sel.toString());
      }, 50);
    };

    const handleMouseDown = (event: MouseEvent) => {
      clearTimeout(showTimer);
      const target = event?.target as HTMLElement;
      if (!target.closest('[aria-label="add"]')) {
        if (isSelectionButtonVisible) {
          setIsSelectionButtonVisible(false);
        }
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      clearTimeout(showTimer);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isSelectionButtonVisible]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onNewMessage({ chatId: id, message: inputValue });
    setInputValue("");
  };

  return (
    <div
      style={{
        position: "absolute",
        left: boxPosition.x,
        top: boxPosition.y,
        zIndex: 1000,
      }}
      data-chat-id={id}
    >
      <div
        ref={cardRef}
        className="bg-white rounded-3xl shadow-2xl w-[700px] relative"
        data-stop-pan
      >
        {!isRoot && onDelete && (
          <button
            onClick={() => onDelete(id)}
            className="absolute top-6 right-6 z-1 cursor-pointer hover:scale-105 transition-all duration-300 text-gray-400 hover:text-gray-700"
            data-stop-pan
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}
        {quotedText && (
          <div className="px-4 pt-4 text-xs text-gray-500">
            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 text-gray-700 whitespace-pre-wrap">
              {quotedText}
            </div>
          </div>
        )}
        <div className="flex items-center text-zinc-300 hover:text-zinc-900 justify-between p-4">
          <div className="flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-grip-horizontal-icon lucide-grip-horizontal select-none cursor-grab active:cursor-grabbing"
              onMouseDown={handleHeaderMouseDown}
            >
              <circle cx="12" cy="9" r="1" />
              <circle cx="19" cy="9" r="1" />
              <circle cx="5" cy="9" r="1" />
              <circle cx="12" cy="15" r="1" />
              <circle cx="19" cy="15" r="1" />
              <circle cx="5" cy="15" r="1" />
            </svg>
            <div>
              <button className="flex items-center gap-2 border border-zinc-200 rounded-md px-2 py-1 cursor-pointer">
                <div className="text-black hover:text-zinc-900 transition-all duration-300">
                  <Image
                    src="/image.png"
                    alt="Parallel"
                    width={18}
                    height={18}
                    className="w-[16px] h-[16px]"
                  />
                </div>
                <div className=" text-[12px] text-black select-text">
                  Parallel
                </div>
              </button>
            </div>
            <div>
              <button className="flex items-center gap-2 border border-zinc-200 rounded-md px-2 py-1 hover:bg-zinc-100 transition-all duration-300 hover:scale-105 cursor-pointer text-zinc-400 hover:text-zinc-900">
                <div className=" transition-all duration-300">
                  <PlusIcon className="w-[18px] h-[18px]" />
                </div>
              </button>
            </div>
          </div>
        </div>

        {conversation.length === 0 ? (
          <div className="p-4" onMouseDown={(e) => e.stopPropagation()}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask away..."
              className="w-full px-2 py-1 border-none text-sm text-black rounded-2xl focus:outline-none bg-transparent placeholder:text-gray-400 resize-none overflow-hidden"
              rows={1}
              autoFocus
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
            />
          </div>
        ) : (
          <>
            <div className="p-6">
              <ConversationContent
                conversation={conversation}
                isThinking={isThinking}
              />
            </div>

            <div className="p-4" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder="Ask away..."
                    className="w-full px-4 py-2 pr-12 border border-gray-200 text-sm text-black rounded-2xl focus:outline-none focus:ring-1 focus:ring-black/20 focus:border-transparent"
                  />
                  <button
                    onClick={handleSend}
                    className="absolute right-1 top-1/2 cursor-pointer hover:scale-105 transition-all duration-300 -translate-y-1/2 bg-black text-white hover:bg-zinc-800  font-medium rounded-full w-8 h-8 flex items-center justify-center"
                    tabIndex={-1}
                  >
                    <ArrowUpIcon className="w-4 h-4" />
                  </button>
                </div>
                {onBranch && (
                  <button
                    onClick={() => onBranch(id)}
                    className="flex items-center gap-1 text-sm text-gray-500 cursor-pointer hover:scale-105 transition-all duration-300 hover:text-gray-800 border border-gray-200 rounded-2xl px-4 py-2 "
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Branch
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {isSelectionButtonVisible &&
        createPortal(
          <button
            data-stop-pan
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              if (!onCreateFromSelection || !selectionAnchor) return;
              onCreateFromSelection({
                sourceChatId: id,
                text: selectionText,
                viewportX: selectionAnchor.x,
                viewportY: selectionAnchor.y,
              });
              setIsSelectionButtonVisible(false);
              setTimeout(() => {
                window.getSelection()?.removeAllRanges();
              }, 0);
            }}
            className="fixed w-6 h-6 rounded-lg bg-black text-white shadow-md flex items-center justify-center hover:bg-zinc-900 cursor-pointer select-none"
            style={{
              left: selectionButtonPosRef.current.x,
              top: selectionButtonPosRef.current.y,
              zIndex: 2000,
              userSelect: "none",
            }}
            aria-label="add"
          >
            <PlusIcon className="w-4 h-4" />
          </button>,
          document.body
        )}
    </div>
  );
}

export default function Home() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.8);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [layoutMode, setLayoutMode] = useState<"horizontal" | "vertical">(
    "horizontal"
  );

  const CARD_WIDTH = 700;
  const HORIZONTAL_SPACING = 100;
  const VERTICAL_SPACING = 80;

  const [chatTree, setChatTree] = useState<ChatNode[]>([
    {
      id: 1,
      x: 725,
      y: 500,
      quotedText: undefined,
      children: [],
      height: 200,
      conversation: [],
    },
  ]);

  useLayoutEffect(() => {
    if (chatTree.length > 0) {
      const firstNode = chatTree[0];
      setPosition({
        x: window.innerWidth / 2 - (firstNode.x + CARD_WIDTH / 2) * scale,
        y:
          window.innerHeight / 2 - (firstNode.y + firstNode.height / 2) * scale,
      });
    }
  }, []);

  const handleResetView = useCallback(() => {
    const newScale = 0.8;
    setScale(newScale);
    if (chatTree.length > 0) {
      const firstNode = chatTree[0];
      setPosition({
        x: window.innerWidth / 2 - (firstNode.x + CARD_WIDTH / 2) * newScale,
        y:
          window.innerHeight / 2 -
          (firstNode.y + firstNode.height / 2) * newScale,
      });
    }
  }, [chatTree]);

  const flatChats = useMemo(() => {
    function flatten(nodes: ChatNode[]): Omit<ChatNode, "children">[] {
      return nodes.reduce<Omit<ChatNode, "children">[]>((acc, node) => {
        return acc.concat(
          {
            id: node.id,
            x: node.x,
            y: node.y,
            height: node.height,
            quotedText: node.quotedText,
            conversation: node.conversation,
            isThinking: node.isThinking,
          },
          flatten(node.children)
        );
      }, []);
    }
    return flatten(chatTree);
  }, [chatTree]);

  const links = useMemo(() => {
    const pairs: { parent: ChatNode; child: ChatNode }[] = [];
    function findPairs(nodes: ChatNode[]) {
      nodes.forEach((node) => {
        node.children.forEach((child) => {
          pairs.push({ parent: node, child });
        });
        findPairs(node.children);
      });
    }
    findPairs(chatTree);
    return pairs;
  }, [chatTree]);

  const handleCreateFromSelection = useCallback(
    ({
      sourceChatId,
      text,
    }: {
      sourceChatId: number;
      text: string;
      viewportX: number;
      viewportY: number;
    }) => {
      const newId = Date.now();
      const newNode: ChatNode = {
        id: newId,
        quotedText: truncateSelection(text),
        children: [],
        x: 0,
        y: 0,
        height: 150,
        conversation: [],
      };

      setChatTree((currentTree) => {
        function addChild(nodes: ChatNode[]): ChatNode[] {
          return nodes.map((node) => {
            if (node.id === sourceChatId) {
              return { ...node, children: [...node.children, newNode] };
            }
            if (node.children.length > 0) {
              return { ...node, children: addChild(node.children) };
            }
            return node;
          });
        }
        return addChild(currentTree);
      });
    },
    []
  );

  const handleBranch = useCallback((sourceChatId: number) => {
    const newId = Date.now();
    const newNode: ChatNode = {
      id: newId,
      quotedText: undefined,
      children: [],
      x: 0,
      y: 0,
      height: 150,
      conversation: [],
    };

    setChatTree((currentTree) => {
      function addChild(nodes: ChatNode[]): ChatNode[] {
        return nodes.map((node) => {
          if (node.id === sourceChatId) {
            return { ...node, children: [...node.children, newNode] };
          }
          if (node.children.length > 0) {
            return { ...node, children: addChild(node.children) };
          }
          return node;
        });
      }
      return addChild(currentTree);
    });
  }, []);

  const handleDelete = useCallback((chatId: number) => {
    setChatTree((currentTree) => {
      function removeNode(nodes: ChatNode[]): ChatNode[] {
        const newNodes = nodes.filter((node) => node.id !== chatId);
        return newNodes.map((node) => ({
          ...node,
          children: removeNode(node.children),
        }));
      }
      return removeNode(currentTree);
    });
  }, []);

  const handleChatPositionChange = useCallback(
    ({ chatId, x, y }: { chatId: number; x: number; y: number }) => {
      setChatTree((currentTree) => {
        function updatePosition(nodes: ChatNode[]): ChatNode[] {
          return nodes.map((node) => {
            if (node.id === chatId) {
              const dx = x - node.x;
              const dy = y - node.y;
              const moveChildren = (children: ChatNode[]): ChatNode[] => {
                return children.map((child) => ({
                  ...child,
                  x: child.x + dx,
                  y: child.y + dy,
                  children: moveChildren(child.children),
                }));
              };
              return {
                ...node,
                x,
                y,
                children: moveChildren(node.children),
                manualPosition: true,
              };
            }
            return { ...node, children: updatePosition(node.children) };
          });
        }
        return updatePosition(currentTree);
      });
    },
    []
  );

  const handleNewMessage = useCallback(
    async ({ chatId, message }: { chatId: number; message: string }) => {
      setChatTree((tree) =>
        tree.map(function appendMessage(node): ChatNode {
          if (node.id === chatId) {
            return {
              ...node,
              conversation: [
                ...node.conversation,
                { role: "user", content: message },
              ],
              isThinking: true,
            };
          }
          return { ...node, children: node.children.map(appendMessage) };
        })
      );

      let parentConversation: string | undefined;
      const findParent = (
        nodes: ChatNode[],
        childId: number
      ): ChatNode | null => {
        for (const node of nodes) {
          if (node.children.some((child) => child.id === childId)) {
            return node;
          }
          const parent = findParent(node.children, childId);
          if (parent) return parent;
        }
        return null;
      };

      const findNode = (nodes: ChatNode[], id: number): ChatNode | null => {
        for (const node of nodes) {
          if (node.id === id) return node;
          const found = findNode(node.children, id);
          if (found) return found;
        }
        return null;
      };
      const currentNodeDetails = findNode(chatTree, chatId);

      const parentNode = findParent(chatTree, chatId);
      if (parentNode) {
        parentConversation = parentNode.conversation
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: message,
          quotedText: currentNodeDetails?.quotedText,
          parentConversation: parentConversation,
          conversation: currentNodeDetails?.conversation,
        }),
      });

      if (!res.ok) {
        setChatTree((tree) =>
          tree.map(function setErrorState(node): ChatNode {
            if (node.id === chatId) {
              return { ...node, isThinking: false };
            }
            return {
              ...node,
              children: node.children.map(setErrorState),
            };
          })
        );
        return;
      }

      if (!res.body) {
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      setChatTree((tree) =>
        tree.map(function addAssistantPlaceholder(node): ChatNode {
          if (node.id === chatId) {
            return {
              ...node,
              conversation: [
                ...node.conversation,
                { role: "assistant", content: "" },
              ],
              isThinking: false,
            };
          }
          return {
            ...node,
            children: node.children.map(addAssistantPlaceholder),
          };
        })
      );

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunkValue = decoder.decode(value);
        setChatTree((tree) =>
          tree.map(function appendResponseChunk(node): ChatNode {
            if (node.id === chatId) {
              const lastMessage =
                node.conversation[node.conversation.length - 1];
              if (lastMessage?.role === "assistant") {
                const updatedLastMessage = {
                  ...lastMessage,
                  content: lastMessage.content + chunkValue,
                };
                return {
                  ...node,
                  conversation: [
                    ...node.conversation.slice(0, -1),
                    updatedLastMessage,
                  ],
                };
              }
            }
            return {
              ...node,
              children: node.children.map(appendResponseChunk),
            };
          })
        );
      }
    },
    [chatTree, flatChats]
  );

  useLayoutEffect(() => {
    let hasChanges = false;
    const newTree = JSON.parse(JSON.stringify(chatTree));

    function updateHeights(nodes: ChatNode[]) {
      nodes.forEach((node) => {
        const el = document.querySelector(`[data-chat-id="${node.id}"]`);
        if (el && el.clientHeight > 0 && node.height !== el.clientHeight) {
          node.height = el.clientHeight;
          hasChanges = true;
        }
        updateHeights(node.children);
      });
    }
    updateHeights(newTree);

    function layoutVertical(nodes: ChatNode[]) {
      const getSubtreeWidth = (node: ChatNode): number => {
        if (node.children.length === 0) return CARD_WIDTH;
        return node.children
          .map(getSubtreeWidth)
          .reduce(
            (acc, w) => acc + w + HORIZONTAL_SPACING,
            -HORIZONTAL_SPACING
          );
      };

      const positionChildren = (node: ChatNode) => {
        const children = node.children || [];
        if (children.length === 0) return;

        const totalWidth = children
          .map(getSubtreeWidth)
          .reduce(
            (acc, w) => acc + w + HORIZONTAL_SPACING,
            -HORIZONTAL_SPACING
          );

        let xOffset = node.x + CARD_WIDTH / 2 - totalWidth / 2;

        children.forEach((child) => {
          const childWidth = getSubtreeWidth(child);
          const newX = xOffset + childWidth / 2 - CARD_WIDTH / 2;
          const newY = node.y + node.height + VERTICAL_SPACING;

          if (!child.manualPosition && (child.x !== newX || child.y !== newY)) {
            child.x = newX;
            child.y = newY;
            hasChanges = true;
          }

          positionChildren(child);
          xOffset += childWidth + HORIZONTAL_SPACING;
        });
      };
      nodes.forEach((root) => positionChildren(root));
    }

    function layoutHorizontal(nodes: ChatNode[]) {
      const getSubtreeHeight = (node: ChatNode): number => {
        if (node.children.length === 0) {
          return node.height;
        }
        const childrenHeight = node.children
          .map(getSubtreeHeight)
          .reduce((acc, h) => acc + h + VERTICAL_SPACING, -VERTICAL_SPACING);
        return Math.max(node.height, childrenHeight);
      };

      const positionChildren = (node: ChatNode) => {
        const children = node.children || [];
        if (children.length === 0) return;

        const totalHeight = children
          .map(getSubtreeHeight)
          .reduce((acc, h) => acc + h + VERTICAL_SPACING, -VERTICAL_SPACING);

        let yOffset = node.y + node.height / 2 - totalHeight / 2;

        children.forEach((child) => {
          const childHeight = getSubtreeHeight(child);
          const newX = node.x + CARD_WIDTH + HORIZONTAL_SPACING;
          const newY = yOffset + childHeight / 2 - child.height / 2;

          if (!child.manualPosition && (child.x !== newX || child.y !== newY)) {
            child.x = newX;
            child.y = newY;
            hasChanges = true;
          }

          positionChildren(child);
          yOffset += childHeight + VERTICAL_SPACING;
        });
      };

      nodes.forEach((root) => positionChildren(root));
    }

    if (layoutMode === "horizontal") {
      layoutHorizontal(newTree);
    } else {
      layoutVertical(newTree);
    }

    if (hasChanges) {
      setChatTree(newTree);
    }
  }, [chatTree, layoutMode]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-stop-pan]")) {
      return;
    }
    if (e.button === 0) {
      setIsPanning(true);
      setStartPan({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPosition({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const delta = e.deltaY * -0.001;
    const newScale = Math.min(Math.max(0.1, scale + delta), 3);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleChange = newScale / scale;

      setPosition({
        x: mouseX - (mouseX - position.x) * scaleChange,
        y: mouseY - (mouseY - position.y) * scaleChange,
      });
    }

    setScale(newScale);
  };

  const [canvasSize, setCanvasSize] = useState({
    width: "100vw",
    height: "100vh",
  });

  useLayoutEffect(() => {
    const getCanvasAndContentSize = () => {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      flatChats.forEach((chat) => {
        const card = document.querySelector(`[data-chat-id="${chat.id}"]`);
        const cardHeight = card?.clientHeight || 200;
        const cardWidth = card?.clientWidth || CARD_WIDTH;
        minX = Math.min(minX, chat.x);
        maxX = Math.max(maxX, chat.x + cardWidth);
        minY = Math.min(minY, chat.y);
        maxY = Math.max(maxY, chat.y + cardHeight);
      });

      const padding = 200;
      const contentWidth = maxX === -Infinity ? 0 : maxX - minX + 2 * padding;
      const contentHeight = maxY === -Infinity ? 0 : maxY - minY + 2 * padding;

      return {
        width: Math.max(window.innerWidth * 2, contentWidth),
        height: Math.max(window.innerHeight * 2, contentHeight),
      };
    };

    const newSize = getCanvasAndContentSize();
    setCanvasSize({
      width: `${newSize.width}px`,
      height: `${newSize.height}px`,
    });
  }, [flatChats]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-white">
      <div
        ref={canvasRef}
        className="absolute inset-0 "
        style={{ width: canvasSize.width, height: canvasSize.height }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(0, 0, 0, 0.2) 1px, transparent 1px)`,
            backgroundSize: `${40 * scale}px ${40 * scale}px`,
            backgroundPosition: `${position.x}px ${position.y}px`,
          }}
        />
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div
            className="absolute left-0 top-0 pointer-events-none"
            style={{ width: 9999, height: 9999 }}
          >
            {links.map(({ parent, child }) => {
              const { x1, y1, x2, y2, pathD } =
                layoutMode === "horizontal"
                  ? {
                      x1: parent.x + CARD_WIDTH,
                      y1: parent.y + parent.height / 2,
                      x2: child.x,
                      y2: child.y + child.height / 2,
                      pathD: (
                        sx1: number,
                        sy1: number,
                        sx2: number,
                        sy2: number
                      ) =>
                        `M${sx1},${sy1} C${(sx1 + sx2) / 2},${sy1} ${
                          (sx1 + sx2) / 2
                        },${sy2} ${sx2},${sy2}`,
                    }
                  : {
                      x1: parent.x + CARD_WIDTH / 2,
                      y1: parent.y + parent.height,
                      x2: child.x + CARD_WIDTH / 2,
                      y2: child.y,
                      pathD: (
                        sx1: number,
                        sy1: number,
                        sx2: number,
                        sy2: number
                      ) =>
                        `M${sx1},${sy1} C${sx1},${(sy1 + sy2) / 2} ${sx2},${
                          (sy1 + sy2) / 2
                        } ${sx2},${sy2}`,
                    };

              const left = Math.min(x1, x2) - 10;
              const top = Math.min(y1, y2) - 10;
              const width = Math.abs(x2 - x1) + 20;
              const height = Math.abs(y2 - y1) + 20;

              const sx1 = x1 - left;
              const sy1 = y1 - top;
              const sx2 = x2 - left;
              const sy2 = y2 - top;

              return (
                <svg
                  key={`${parent.id}-${child.id}`}
                  style={{
                    position: "absolute",
                    left,
                    top,
                    overflow: "visible",
                  }}
                  width={width}
                  height={height}
                >
                  <path
                    d={pathD(sx1, sy1, sx2, sy2)}
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    fill="none"
                    strokeDasharray="5, 5"
                  />
                </svg>
              );
            })}
          </div>

          {flatChats.map((chat) => (
            <DraggableChat
              key={chat.id}
              id={chat.id}
              initialX={chat.x}
              initialY={chat.y}
              scale={scale}
              canvasPosition={position}
              quotedText={chat.quotedText}
              conversation={chat.conversation}
              isThinking={chat.isThinking}
              onNewMessage={handleNewMessage}
              onCreateFromSelection={handleCreateFromSelection}
              onPositionChange={handleChatPositionChange}
              onBranch={handleBranch}
              onDelete={handleDelete}
              isRoot={chat.id === chatTree[0]?.id}
            />
          ))}
        </div>
      </div>

      <div className="fixed z-20 flex gap-2 bottom-0 -left-2  text-zinc-400 px-4 py-2 items-start text-xs">
        <button
          className="hover:text-zinc-600 flex items-center gap-2 py-2 px-2 rounded-lg bg-white border border-zinc-100 hover:bg-zinc-50 hover:border-zinc-300 active:bg-zinc-100 text-zinc-400 cursor-pointer transition-all duration-300 hover:scale-95"
          onClick={handleResetView}
        >
          <ZoomInIcon className="w-3.5 h-3.5 " /> {(scale * 100).toFixed(0)}%
        </button>
        <button
          className="hover:text-zinc-600 flex items-center gap-2 py-2 px-2 rounded-lg bg-white border border-zinc-100 hover:bg-zinc-50 hover:border-zinc-300 active:bg-zinc-100 text-zinc-400 cursor-pointer transition-all duration-300 hover:scale-95"
          onClick={handleResetView}
        >
          <LocateFixed className="w-3.5 h-3.5 " /> ({position.x.toFixed(0)},{" "}
          {position.y.toFixed(0)})
        </button>
        <button
          className="hover:text-zinc-600 flex items-center gap-2 py-2 px-2 rounded-lg bg-white border border-zinc-100 hover:bg-zinc-50 hover:border-zinc-300 active:bg-zinc-100 text-zinc-400 cursor-pointer transition-all duration-300 hover:scale-95"
          onClick={() =>
            setLayoutMode((prev) =>
              prev === "horizontal" ? "vertical" : "horizontal"
            )
          }
        >
          <GitBranch className="w-3.5 h-3.5 " />
          {layoutMode === "horizontal" ? "Horizontal" : "Vertical"}
        </button>
      </div>
    </div>
  );
}
