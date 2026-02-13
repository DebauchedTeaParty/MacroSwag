using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace KeySender
{
    class Program
    {
        [DllImport("user32.dll")]
        private static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public uint type;
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        private const uint INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_SCANCODE = 0x0008;

        // Virtual key codes
        private const ushort VK_LWIN = 0x5B;
        private const ushort VK_RSHIFT = 0xA1;
        private const ushort VK_LSHIFT = 0xA0;
        private const ushort VK_LCONTROL = 0xA2;
        private const ushort VK_RCONTROL = 0xA3;
        private const ushort VK_LMENU = 0xA4; // Left Alt
        private const ushort VK_RMENU = 0xA5; // Right Alt

        static int Main(string[] args)
        {
            if (args.Length == 0)
            {
                Console.WriteLine("Usage: KeySender.exe <sequence>");
                Console.WriteLine("Sequence format: # = Win, + = Shift, ^ = Ctrl, % = Alt");
                return 1;
            }

            string sequence = args[0];
            SendKeyCombo(sequence);
            return 0;
        }

        static void SendKeyCombo(string sequence)
        {
            // Parse SendKeys format: # = Win, + = Shift, ^ = Ctrl, % = Alt
            bool win = sequence.Contains("#");
            bool shift = sequence.Contains("+");
            bool ctrl = sequence.Contains("^");
            bool alt = sequence.Contains("%");

            // Extract the actual key (remove modifiers)
            string key = sequence.Replace("#", "").Replace("+", "").Replace("^", "").Replace("%", "");

            // Convert key to virtual key code
            ushort vk = 0;
            if (key.Length == 1)
            {
                vk = (ushort)(key.ToUpper()[0]);
            }
            else if (key.StartsWith("{") && key.EndsWith("}"))
            {
                // Handle special keys in braces
                switch (key.ToUpper())
                {
                    case "{ENTER}": vk = 0x0D; break;
                    case "{ESC}": vk = 0x1B; break;
                    case "{TAB}": vk = 0x09; break;
                    case "{SPACE}": vk = 0x20; break;
                    default: vk = key.Length > 2 ? (ushort)(key.ToUpper()[1]) : (ushort)0; break;
                }
            }
            else
            {
                vk = key.Length > 0 ? (ushort)(key.ToUpper()[0]) : (ushort)0;
            }

            if (vk == 0)
            {
                Console.Error.WriteLine("Error: Could not determine virtual key code for: " + key);
                return;
            }

            var inputs = new System.Collections.Generic.List<INPUT>();

            // Press modifiers with small delays
            if (win)
            {
                inputs.Add(CreateKeyInput(VK_LWIN, false));
            }
            Thread.Sleep(10);
            if (shift)
            {
                inputs.Add(CreateKeyInput(VK_LSHIFT, false));
            }
            Thread.Sleep(10);
            if (ctrl)
            {
                inputs.Add(CreateKeyInput(VK_LCONTROL, false));
            }
            Thread.Sleep(10);
            if (alt)
            {
                inputs.Add(CreateKeyInput(VK_LMENU, false));
            }
            Thread.Sleep(10);

            // Press main key
            inputs.Add(CreateKeyInput(vk, false));
            Thread.Sleep(20);

            // Release main key
            inputs.Add(CreateKeyInput(vk, true));
            Thread.Sleep(10);

            // Release modifiers (reverse order)
            if (alt)
            {
                inputs.Add(CreateKeyInput(VK_LMENU, true));
            }
            Thread.Sleep(10);
            if (ctrl)
            {
                inputs.Add(CreateKeyInput(VK_LCONTROL, true));
            }
            Thread.Sleep(10);
            if (shift)
            {
                inputs.Add(CreateKeyInput(VK_LSHIFT, true));
            }
            Thread.Sleep(10);
            if (win)
            {
                inputs.Add(CreateKeyInput(VK_LWIN, true));
            }

            // Send all inputs at once
            uint result = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
            if (result == 0)
            {
                Console.Error.WriteLine("Warning: SendInput returned 0 (may have failed)");
            }
        }

        private static INPUT CreateKeyInput(ushort vk, bool keyUp)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.ki.wVk = vk;
            input.ki.wScan = 0;
            input.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
            input.ki.time = 0;
            input.ki.dwExtraInfo = IntPtr.Zero;
            return input;
        }
    }
}

