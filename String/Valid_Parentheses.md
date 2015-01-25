Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

The brackets must close in the correct order, "()" and "()[]{}" are all valid but "(]" and "([)]" are not.

```Java
public class Solution {
    public boolean isValid(String s) {
        Stack<Character> myStack = new Stack<Character>();
        for(int i = 0; i < s.length(); i++)
        {   char curr = s.charAt(i);
            if(isLeft(curr)){
                myStack.push(curr);
            }
            else{
                if(myStack.empty()) return false;
                if(!isPair(myStack.pop(), curr))
                return false;
            }
            
        }
       return myStack.empty();
    }
    private boolean isLeft(char a){
        return (a=='{' || a == '[' || a == '(');
    }
    
    private boolean isPair(char a, char b){
        if(a == '(' && b == ')') return true;
        if(a == '{' && b == '}') return true;
        if(a == '[' && b == ']') return true;
        return false;
    }
}

```