using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace KeySender
{
    class Program
    {
        [DllImport("user32.dll")]
        private static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);
        
        [DllImport("user32.dll")]
        private static extern ushort MapVirtualKey(ushort uCode, uint uMapType);
        
        [DllImport("kernel32.dll")]
        private static extern uint GetLastError();
        
        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
        
        private const uint KEYEVENTF_KEYUP_ALT = 0x0002;
        
        private const uint MAPVK_VK_TO_VSC = 0x00;

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
        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

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
            Console.WriteLine("KeySender: Processing sequence: " + sequence);
            
            // Parse SendKeys format: # = Win, + = Shift, ^ = Ctrl, % = Alt
            bool win = sequence.Contains("#");
            bool shift = sequence.Contains("+");
            bool ctrl = sequence.Contains("^");
            bool alt = sequence.Contains("%");

            // Extract the actual key (remove modifiers)
            string key = sequence.Replace("#", "").Replace("+", "").Replace("^", "").Replace("%", "");
            
            Console.WriteLine("KeySender: Win=" + win + ", Shift=" + shift + ", Ctrl=" + ctrl + ", Alt=" + alt + ", Key=" + key);

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
            
            Console.WriteLine("KeySender: Virtual key code: 0x" + vk.ToString("X"));

            // Use keybd_event directly - it's more reliable than SendInput for this use case
            // Press modifiers first
            if (win)
            {
                Console.WriteLine("KeySender: Pressing Win key");
                keybd_event((byte)VK_LWIN, 0, 0, 0);
                Thread.Sleep(20);
            }
            if (shift)
            {
                Console.WriteLine("KeySender: Pressing Shift key");
                keybd_event((byte)VK_LSHIFT, 0, 0, 0);
                Thread.Sleep(20);
            }
            if (ctrl)
            {
                Console.WriteLine("KeySender: Pressing Ctrl key");
                keybd_event((byte)VK_LCONTROL, 0, 0, 0);
                Thread.Sleep(20);
            }
            if (alt)
            {
                Console.WriteLine("KeySender: Pressing Alt key");
                keybd_event((byte)VK_LMENU, 0, 0, 0);
                Thread.Sleep(20);
            }

            // Press main key
            Console.WriteLine("KeySender: Pressing main key: " + key);
            keybd_event((byte)vk, 0, 0, 0);
            Thread.Sleep(50);

            // Release main key
            Console.WriteLine("KeySender: Releasing main key: " + key);
            keybd_event((byte)vk, 0, KEYEVENTF_KEYUP_ALT, 0);
            Thread.Sleep(20);

            // Release modifiers (reverse order)
            if (alt)
            {
                Console.WriteLine("KeySender: Releasing Alt key");
                keybd_event((byte)VK_LMENU, 0, KEYEVENTF_KEYUP_ALT, 0);
                Thread.Sleep(20);
            }
            if (ctrl)
            {
                Console.WriteLine("KeySender: Releasing Ctrl key");
                keybd_event((byte)VK_LCONTROL, 0, KEYEVENTF_KEYUP_ALT, 0);
                Thread.Sleep(20);
            }
            if (shift)
            {
                Console.WriteLine("KeySender: Releasing Shift key");
                keybd_event((byte)VK_LSHIFT, 0, KEYEVENTF_KEYUP_ALT, 0);
                Thread.Sleep(20);
            }
            if (win)
            {
                Console.WriteLine("KeySender: Releasing Win key");
                keybd_event((byte)VK_LWIN, 0, KEYEVENTF_KEYUP_ALT, 0);
                Thread.Sleep(20);
            }
            
            Console.WriteLine("KeySender: Completed successfully");
        }

        private static INPUT CreateKeyInput(ushort vk, bool keyUp)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            // Use virtual key code (not scan codes) - more reliable
            input.ki.wVk = vk;
            input.ki.wScan = 0; // Not using scan codes
            // Set flags - no scan code flag when using virtual key codes
            uint flags = 0;
            if (keyUp) flags |= KEYEVENTF_KEYUP;
            input.ki.dwFlags = flags;
            input.ki.time = 0;
            input.ki.dwExtraInfo = IntPtr.Zero;
            return input;
        }
    }
}

